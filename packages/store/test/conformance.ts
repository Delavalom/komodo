/**
 * Driver conformance suite.
 *
 * Every driver must satisfy this identically — that is the whole promise of
 * the port, and the only thing standing between `komodo dev` and `komodo
 * serve` behaving differently. The Postgres driver runs this same suite.
 */
import { beforeEach, afterEach, describe, expect, it } from "vitest";

import type { KomodoStore, PullRequestInput } from "../src/port.js";

const T0 = 1_700_000_000_000;

function pr(over: Partial<PullRequestInput> = {}): PullRequestInput {
  return {
    repoId: "acme/api",
    number: 1,
    title: "Add rate limiting",
    author: "renata",
    url: "https://github.com/acme/api/pull/1",
    headSha: "aaa111",
    state: "open",
    isDraft: false,
    requestedReviewers: ["dev"],
    approvals: [],
    changesRequested: [],
    additions: 40,
    deletions: 3,
    changedFiles: 2,
    createdAt: T0,
    updatedAt: T0,
    mergedAt: null,
    ...over,
  };
}

export function describeStore(name: string, make: () => Promise<KomodoStore>) {
  describe(name, () => {
    let store: KomodoStore;

    beforeEach(async () => {
      store = await make();
      await store.upsertRepository({
        id: "acme/api",
        owner: "acme",
        name: "api",
        provider: "github",
        enabled: true,
        reviewCount: 0,
      });
    });

    afterEach(() => store.close());

    it("derives a stable pull request id, so re-polling never duplicates", async () => {
      const first = await store.upsertPullRequest(pr());
      const second = await store.upsertPullRequest(pr({ title: "Renamed" }));

      expect(second).toBe(first);
      const all = await store.listPullRequests();
      expect(all).toHaveLength(1);
      expect(all[0].title).toBe("Renamed");
    });

    it("round-trips the fields the queue reads", async () => {
      await store.upsertPullRequest(
        pr({ requestedReviewers: ["dev", "sam"], approvals: ["kai"] }),
      );
      const [row] = await store.listPullRequests();

      expect(row.requestedReviewers).toEqual(["dev", "sam"]);
      expect(row.approvals).toEqual(["kai"]);
      expect(row.changesRequested).toEqual([]);
      expect(row.isDraft).toBe(false);
      expect(row.mergedAt).toBeNull();
      expect(row.additions).toBe(40);
    });

    it("keys judgments on (prId, headSha) and counts re-reviews", async () => {
      const prId = await store.upsertPullRequest(pr());
      const a = await store.upsertJudgment({
        prId, headSha: "aaa111", verdict: "ship",
        status: "completed", impact: "low", score: 90,
      });
      const b = await store.upsertJudgment({
        prId, headSha: "aaa111", verdict: "needs_work",
        status: "completed", impact: "high", score: 40,
      });

      expect(b).toBe(a);
      const { judgments } = await store.snapshot();
      expect(judgments).toHaveLength(1);
      expect(judgments[0].verdict).toBe("needs_work");
      expect(judgments[0].reviewCount).toBe(2);
    });

    it("joins git facts into the judgment read-model without losing either id", async () => {
      const prId = await store.upsertPullRequest(pr());
      const judgmentId = await store.upsertJudgment({
        prId, headSha: "aaa111", verdict: "ship",
        status: "completed", impact: "low", score: 90,
      });

      const [j] = (await store.snapshot()).judgments;
      expect(j.id).toBe(judgmentId);
      expect(j.prId).toBe(prId);
      expect(j.id).not.toBe(j.prId);
      expect(j.title).toBe("Add rate limiting");
      expect(j.author).toBe("renata");
      expect(j.requestedReviewers).toEqual(["dev"]);
    });

    describe("the ingester work list", () => {
      it("offers an unreviewed open pull request", async () => {
        await store.upsertPullRequest(pr());
        expect(await store.listPullRequestsNeedingReview()).toHaveLength(1);
      });

      it("drops it once a review completes at that head", async () => {
        const prId = await store.upsertPullRequest(pr());
        await store.upsertJudgment({
          prId, headSha: "aaa111", verdict: "ship",
          status: "completed", impact: "low", score: 90,
        });
        expect(await store.listPullRequestsNeedingReview()).toHaveLength(0);
      });

      it("offers it again after a new push, with no explicit invalidation", async () => {
        const prId = await store.upsertPullRequest(pr());
        await store.upsertJudgment({
          prId, headSha: "aaa111", verdict: "ship",
          status: "completed", impact: "low", score: 90,
        });
        await store.upsertPullRequest(pr({ headSha: "bbb222" }));

        const pending = await store.listPullRequestsNeedingReview();
        expect(pending).toHaveLength(1);
        expect(pending[0].headSha).toBe("bbb222");
      });

      it("does not offer a review that died half-finished twice over", async () => {
        const prId = await store.upsertPullRequest(pr());
        await store.upsertJudgment({
          prId, headSha: "aaa111", verdict: null,
          status: "pending", impact: "low", score: 0,
        });
        // Still pending, so still work — but the row is reused, not duplicated.
        expect(await store.listPullRequestsNeedingReview()).toHaveLength(1);
        expect((await store.snapshot()).judgments).toHaveLength(1);
      });

      it("skips drafts and anything not open", async () => {
        await store.upsertPullRequest(pr({ number: 2, isDraft: true }));
        await store.upsertPullRequest(pr({ number: 3, state: "merged" }));
        await store.upsertPullRequest(pr({ number: 4, state: "closed" }));
        expect(await store.listPullRequestsNeedingReview()).toHaveLength(0);
      });
    });

    it("replaces findings wholesale so a re-review cannot duplicate them", async () => {
      const prId = await store.upsertPullRequest(pr());
      const judgmentId = await store.upsertJudgment({
        prId, headSha: "aaa111", verdict: "needs_work",
        status: "completed", impact: "high", score: 40,
      });

      const finding = {
        title: "SQL injection in searchUsers",
        body: "User input is interpolated into the query.",
        severity: "P0" as const,
        isSecurity: true,
        filePath: "src/db.ts",
      };
      await store.replaceFindings(judgmentId, [finding, { ...finding, title: "Off-by-one" }]);
      await store.replaceFindings(judgmentId, [finding]);

      const { findings } = await store.snapshot();
      expect(findings).toHaveLength(1);
      expect(findings[0].judgmentId).toBe(judgmentId);
      expect(findings[0].isSecurity).toBe(true);
      expect(findings[0].status).toBe("open");
    });

    it("sends retriggered judgments back to the work list", async () => {
      const prId = await store.upsertPullRequest(pr());
      const judgmentId = await store.upsertJudgment({
        prId, headSha: "aaa111", verdict: "ship",
        status: "completed", impact: "low", score: 90,
      });
      expect(await store.listPullRequestsNeedingReview()).toHaveLength(0);

      await store.retriggerReviews([judgmentId]);

      const [j] = (await store.snapshot()).judgments;
      expect(j.status).toBe("pending");
      expect(j.verdict).toBeNull();
      expect(await store.listPullRequestsNeedingReview()).toHaveLength(1);
    });

    it("round-trips a team's roster and watched repos", async () => {
      const memberId = await store.saveMember({
        email: "renata@acme.dev", name: "Renata", githubLogin: "renata",
        role: "member", avatarSeed: "renata", isYou: false,
      });
      const teamId = await store.saveTeam({
        name: "Core Infra", memberIds: [memberId], watchedRepoIds: ["acme/api"],
      });

      const { teams, members } = await store.snapshot();
      expect(teams).toHaveLength(1);
      expect(teams[0].id).toBe(teamId);
      expect(teams[0].memberIds).toEqual([memberId]);
      expect(teams[0].watchedRepoIds).toEqual(["acme/api"]);
      expect(members[0].githubLogin).toBe("renata");
    });

    it("replaces a team's roster on save rather than appending to it", async () => {
      const a = await store.saveMember({
        email: "a@acme.dev", name: "A", githubLogin: "a",
        role: "member", avatarSeed: "a", isYou: false,
      });
      const b = await store.saveMember({
        email: "b@acme.dev", name: "B", githubLogin: "b",
        role: "member", avatarSeed: "b", isYou: false,
      });
      const teamId = await store.saveTeam({
        name: "Core Infra", memberIds: [a, b], watchedRepoIds: [],
      });
      await store.saveTeam({
        id: teamId, name: "Core Infra", memberIds: [b], watchedRepoIds: [],
      });

      const { teams } = await store.snapshot();
      expect(teams[0].memberIds).toEqual([b]);
    });

    it("toggles a repository without disturbing its pull requests", async () => {
      await store.upsertPullRequest(pr());
      await store.setRepoEnabled("acme/api", false);

      const { repositories } = await store.snapshot();
      expect(repositories[0].enabled).toBe(false);
      expect(await store.listPullRequests()).toHaveLength(1);
    });
  });
}
