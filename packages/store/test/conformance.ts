/**
 * Driver conformance suite.
 *
 * Every driver must satisfy this identically — that is the whole promise of
 * the port, and the only thing standing between `komodo dev` and `komodo
 * serve` behaving differently. The Postgres driver runs this same suite.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import type { KomodoStore, PullRequestInput, ReviewInput } from "../src/port.js";

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

/**
 * A review run with the two shapes that matter: one judgement GitHub could
 * have commented on, and one it could not.
 */
function review(over: Partial<ReviewInput> = {}): ReviewInput {
  return {
    prId: "acme/api#1",
    headSha: "aaa111",
    provider: "claude",
    model: "claude-opus-5",
    summary: "- Rotates session tokens on refresh",
    walkthrough: [{ files: ["auth/session.ts"], summary: "Rotates the token." }],
    confidence: 3,
    effort: 2,
    verdictLine: "Ships once the cache question is settled.",
    diagram: "sequenceDiagram\n  A->>B: hi",
    recordId: "acme-api-1-1700000000000",
    files: [
      {
        path: "auth/session.ts",
        additions: 12,
        deletions: 3,
        status: "modified",
        patch: "@@ -86,3 +86,12 @@\n+await store.revoke(id)",
      },
    ],
    judgements: [
      {
        path: "auth/session.ts",
        line: 88,
        endLine: null,
        severity: "major",
        kind: "Risk",
        focus: "architecture",
        tag: "changes how logging out works",
        title: "Sessions outlive logout by up to fifteen minutes.",
        lede: "The token is revoked in the store but the edge cache keeps serving it.",
        detail: "Revoking the cache entry costs one extra round trip.",
        ask: "Is a fifteen-minute window acceptable here?",
        sources: ["the diff"],
        sourceNote: "The diff revokes in the store only.",
        code: "auth/session.ts:88 await store.revoke(id)",
        options: [
          { label: "Yes — fifteen minutes is fine", bucket: "Agreed" },
          { label: "No — revoke the cache entry", bucket: "Blocks" },
          { label: "I have a question first", bucket: "Asked" },
          { label: "Not my call", bucket: "Passed on" },
        ],
        suggestion: "await cache.revoke(id)",
        fixPrompt: "Revoke the edge cache entry alongside the store token.",
        postable: true,
      },
      {
        path: "edge/cache.ts",
        line: 4,
        endLine: 9,
        severity: "minor",
        kind: "Unsure",
        focus: "tests",
        tag: "reaches outside this change",
        title: "The cache TTL is set outside the diff.",
        lede: "Nothing here shows what the TTL actually is.",
        detail: "It may already be shorter than fifteen minutes.",
        ask: "What is the TTL on this cache?",
        sources: ["the diff", "PR description"],
        sourceNote: "Neither names the TTL.",
        code: "edge/cache.ts:4 const TTL = ...",
        options: [
          { label: "It is shorter — no issue", bucket: "Agreed" },
          { label: "It is longer — fix it", bucket: "Blocks" },
          { label: "I have a question first", bucket: "Asked" },
          { label: "Hand this to the platform team", bucket: "Passed on" },
        ],
        suggestion: null,
        fixPrompt: "State the cache TTL and compare it to the token lifetime.",
        // Anchored to a line the diff does not expose: GitHub would have
        // dropped this one. Komodo keeps it.
        postable: false,
      },
    ],
    verificationRequirements: [
      {
        title: "A signed-in user can log out in the preview.",
        instruction: "Open the preview, sign in, then use Log out.",
        expectedResult: "The session ends and a protected page redirects to sign-in.",
        evidenceKinds: ["preview", "video"],
        required: true,
      },
      {
        title: "The session revocation test passes against the real store.",
        instruction: "Run the session integration test with the configured store.",
        expectedResult: "The test exits successfully without retries.",
        evidenceKinds: ["test_run", "command_output"],
        required: false,
      },
    ],
    ...over,
    version: 3,
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

    it("exposes raw pull requests in the shared snapshot before any AI review", async () => {
      await store.upsertPullRequest(pr());

      const snapshot = await store.snapshot();
      expect(snapshot.pullRequests).toHaveLength(1);
      expect(snapshot.pullRequests[0]).toMatchObject({
        id: "acme/api#1",
        headSha: "aaa111",
        title: "Add rate limiting",
      });
      expect(snapshot.judgments).toEqual([]);
    });

    it("requests one durable AI job per pull-request head", async () => {
      const prId = await store.upsertPullRequest(pr());
      const first = await store.requestAIReview({
        prId,
        headSha: "aaa111",
        trigger: "new_pull_request",
        requestedAt: T0,
      });
      const second = await store.requestAIReview({
        prId,
        headSha: "aaa111",
        trigger: "new_pull_request",
        requestedAt: T0 + 1,
      });

      expect(second).toBe(first);
      expect(await store.listAIReviewJobs()).toHaveLength(1);
      expect((await store.snapshot()).aiReviewJobs[0]).toMatchObject({
        id: "acme/api#1@aaa111",
        state: "queued",
        trigger: "new_pull_request",
      });
    });

    it("leases a job once, reclaims an expired lease, and enforces ownership", async () => {
      const prId = await store.upsertPullRequest(pr());
      await store.requestAIReview({
        prId,
        headSha: "aaa111",
        trigger: "new_pull_request",
        requestedAt: T0,
      });

      const first = await store.claimNextAIReview({
        workerId: "worker-a",
        now: T0,
        leaseMs: 100,
      });
      expect(first?.pr.id).toBe(prId);
      expect(
        await store.claimNextAIReview({
          workerId: "worker-b",
          now: T0 + 50,
          leaseMs: 100,
        }),
      ).toBeNull();

      const reclaimed = await store.claimNextAIReview({
        workerId: "worker-b",
        now: T0 + 101,
        leaseMs: 100,
      });
      expect(reclaimed?.job.workerId).toBe("worker-b");
      expect(
        await store.finishAIReviewJob({
          jobId: first!.job.id,
          workerId: "worker-a",
          state: "completed",
          finishedAt: T0 + 102,
        }),
      ).toBe(false);
      expect(
        await store.finishAIReviewJob({
          jobId: reclaimed!.job.id,
          workerId: "worker-b",
          state: "completed",
          finishedAt: T0 + 102,
        }),
      ).toBe(true);
      expect((await store.listAIReviewJobs())[0].state).toBe("completed");
    });

    it("keys judgments on (prId, headSha), so a re-review replaces", async () => {
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
    });

    /* ── Derived engagement ───────────────────────────────────────────── */

    describe("engagement numbers", () => {
      /**
       * These were columns, and the only thing that ever wrote them was the
       * seeder — so every one of them was zero on a real deployment while
       * looking, in dev, entirely alive. They are counted at read time now,
       * and these tests are what keeps them counted from the rows that
       * actually caused them.
       */
      const judgmentFor = async (id: string) =>
        (await store.snapshot()).judgments.find((j) => j.id === id)!;

      it("counts runs, not upserts", async () => {
        const prId = await store.upsertPullRequest(pr());
        const id = await store.upsertJudgment({
          prId, headSha: "aaa111", verdict: "ship",
          status: "completed", impact: "low", score: 90,
        });
        expect((await judgmentFor(id)).reviewCount).toBe(0);

        await store.saveReview(review({ prId }));
        expect((await judgmentFor(id)).reviewCount).toBe(1);

        // The same head again replaces its run rather than adding one.
        await store.saveReview(review({ prId }));
        expect((await judgmentFor(id)).reviewCount).toBe(1);

        // A new head is a new run.
        await store.saveReview(review({ prId, headSha: "bbb222" }));
        expect((await judgmentFor(id)).reviewCount).toBe(2);
      });

      it("counts the newest run's judgements as the comment total", async () => {
        const prId = await store.upsertPullRequest(pr());
        const id = await store.upsertJudgment({
          prId, headSha: "aaa111", verdict: "ship",
          status: "completed", impact: "low", score: 90,
        });
        await store.saveReview(review({ prId }));

        // The fixture carries two judgements.
        expect((await judgmentFor(id)).totalComments).toBe(2);
        expect((await judgmentFor(id)).addressedComments).toBe(0);
      });

      it("counts a judgement as addressed once it has been answered", async () => {
        const prId = await store.upsertPullRequest(pr());
        const id = await store.upsertJudgment({
          prId, headSha: "aaa111", verdict: "ship",
          status: "completed", impact: "low", score: 90,
        });
        const reviewId = await store.saveReview(review({ prId }));

        await store.recordAnswer({
          judgementId: `${reviewId}:0`, actorLogin: "renata",
          bucket: "Agreed", optionLabel: "Yes",
        });
        expect((await judgmentFor(id)).addressedComments).toBe(1);

        // Withdrawing appends a null bucket, and the count follows.
        await store.recordAnswer({
          judgementId: `${reviewId}:0`, actorLogin: "renata", bucket: null,
        });
        expect((await judgmentFor(id)).addressedComments).toBe(0);
      });

      it("counts votes, one per person per judgement", async () => {
        const prId = await store.upsertPullRequest(pr());
        const id = await store.upsertJudgment({
          prId, headSha: "aaa111", verdict: "ship",
          status: "completed", impact: "low", score: 90,
        });
        const reviewId = await store.saveReview(review({ prId }));
        const judgementId = `${reviewId}:0`;

        await store.recordVote({ judgementId, actorLogin: "renata", value: 1 });
        await store.recordVote({ judgementId, actorLogin: "marco", value: -1 });
        expect(await judgmentFor(id)).toMatchObject({ upvotes: 1, downvotes: 1 });

        // Changing your mind replaces rather than accumulating.
        await store.recordVote({ judgementId, actorLogin: "marco", value: 1 });
        expect(await judgmentFor(id)).toMatchObject({ upvotes: 2, downvotes: 0 });

        // And withdrawing removes it.
        await store.recordVote({ judgementId, actorLogin: "marco", value: null });
        expect(await judgmentFor(id)).toMatchObject({ upvotes: 1, downvotes: 0 });
      });

      it("lists the votes on a run", async () => {
        const prId = await store.upsertPullRequest(pr());
        const reviewId = await store.saveReview(review({ prId }));
        await store.recordVote({
          judgementId: `${reviewId}:0`, actorLogin: "renata", value: 1,
        });

        const votes = await store.listVotes(reviewId);
        expect(votes).toHaveLength(1);
        expect(votes[0]).toMatchObject({ actorLogin: "renata", value: 1 });
      });

      it("moves a finding's status with the answer to its judgement", async () => {
        // The column only ever held 'open'. These three states existed in the
        // type and could not occur until the status started being derived.
        const prId = await store.upsertPullRequest(pr());
        const judgmentId = await store.upsertJudgment({
          prId, headSha: "aaa111", verdict: "needs_work",
          status: "completed", impact: "high", score: 40,
        });
        const reviewId = await store.saveReview(review({ prId }));
        const [first] = (await store.loadReview(reviewId))!.judgements;

        // The finding names the judgement it summarises.
        await store.replaceFindings(judgmentId, [
          {
            judgementId: first.id,
            title: first.title,
            body: first.lede,
            severity: "P1",
            isSecurity: false,
            filePath: first.path,
          },
        ]);

        const statusNow = async () =>
          (await store.snapshot()).findings[0].status;
        expect(await statusNow()).toBe("open");

        await store.recordAnswer({
          judgementId: first.id, actorLogin: "renata",
          bucket: "Agreed", optionLabel: "Yes",
        });
        expect(await statusNow()).toBe("addressed");

        await store.recordAnswer({
          judgementId: first.id, actorLogin: "renata",
          bucket: "Passed on", optionLabel: "Not my call",
        });
        expect(await statusNow()).toBe("dismissed");
      });

      it("keeps a finding open when somebody answered that it blocks", async () => {
        // `Blocks` is how a reviewer says this has to change before it merges.
        // It used to fall into the catch-all and read as `addressed`, so every
        // count of open concerns — the queue's column, the "needs action"
        // lens, the easy-wins ranking — read zero for a pull request somebody
        // had explicitly blocked.
        const prId = await store.upsertPullRequest(pr());
        const judgmentId = await store.upsertJudgment({
          prId, headSha: "aaa111", verdict: "needs_work",
          status: "completed", impact: "critical", score: 20,
        });
        const reviewId = await store.saveReview(review({ prId }));
        const [first] = (await store.loadReview(reviewId))!.judgements;
        await store.replaceFindings(judgmentId, [
          {
            judgementId: first.id,
            title: first.title,
            body: first.lede,
            severity: "P0",
            isSecurity: false,
            filePath: first.path,
          },
        ]);

        await store.recordAnswer({
          judgementId: first.id,
          actorLogin: "renata",
          bucket: "Blocks",
          optionLabel: "No — revoke the cache entry",
          blocking: true,
        });

        expect((await store.snapshot()).findings[0].status).toBe("open");
      });

      it("leaves a finding open when it names no judgement", async () => {
        // A run recorded before the link existed. Correct, if inert — and it
        // must not throw or pick up somebody else's answer.
        const prId = await store.upsertPullRequest(pr());
        const judgmentId = await store.upsertJudgment({
          prId, headSha: "aaa111", verdict: "ship",
          status: "completed", impact: "low", score: 90,
        });
        const reviewId = await store.saveReview(review({ prId }));
        await store.recordAnswer({
          judgementId: `${reviewId}:0`, actorLogin: "renata",
          bucket: "Agreed", optionLabel: "Yes",
        });
        await store.replaceFindings(judgmentId, [
          {
            title: "Unlinked",
            body: "From an older run.",
            severity: "P2",
            isSecurity: false,
            filePath: "src/old.ts",
          },
        ]);

        expect((await store.snapshot()).findings[0].status).toBe("open");
      });

      it("does not count a judgement someone handed on as addressed", async () => {
        const prId = await store.upsertPullRequest(pr());
        const id = await store.upsertJudgment({
          prId, headSha: "aaa111", verdict: "ship",
          status: "completed", impact: "low", score: 90,
        });
        const reviewId = await store.saveReview(review({ prId }));

        await store.recordAnswer({
          judgementId: `${reviewId}:0`, actorLogin: "renata",
          bucket: "Passed on", optionLabel: "Not my call",
        });
        expect((await judgmentFor(id)).addressedComments).toBe(0);
      });

      it("counts a repository's completed reviews", async () => {
        await store.upsertPullRequest(pr({ number: 1 }));
        await store.upsertPullRequest(pr({ number: 2 }));
        await store.upsertJudgment({
          prId: "acme/api#1", headSha: "aaa111", verdict: "ship",
          status: "completed", impact: "low", score: 90,
        });
        await store.upsertJudgment({
          prId: "acme/api#2", headSha: "aaa111", verdict: null,
          status: "error", impact: "low", score: 0,
        });

        const { repositories } = await store.snapshot();
        const repo = repositories.find((r) => r.id === "acme/api")!;
        // The errored one does not count as a review of anything.
        expect(repo.reviewCount).toBe(1);
      });
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

    it("keeps verification evidence append-only and derives the queue summary", async () => {
      const prId = await store.upsertPullRequest(pr());
      const reviewId = await store.saveReview(review({ prId }));
      const detail = await store.loadReview(reviewId);
      expect(detail?.review.version).toBe(3);
      expect(detail?.verificationRequirements).toHaveLength(2);

      const requirementId = detail!.verificationRequirements[0].id;
      await store.recordVerification({
        requirementId,
        actorLogin: "renata",
        result: "failed",
        evidenceKind: "preview",
        evidenceUrl: "https://preview.example.test/pr/1",
        note: "The protected page stayed open.",
      });
      await store.recordVerification({
        requirementId,
        actorLogin: "renata",
        result: "verified",
        evidenceKind: "video",
        evidenceUrl: "https://evidence.example.test/logout.mp4",
        note: "Retested after the fix.",
      });

      expect(await store.listVerificationEntries(reviewId)).toHaveLength(2);
      expect((await store.loadReview(reviewId))?.verifications).toMatchObject([
        { requirementId, result: "verified", actorLogin: "renata" },
      ]);
      expect((await store.snapshot()).verificationSummaries).toMatchObject([
        {
          reviewId,
          total: 2,
          required: 1,
          verified: 1,
          requiredVerified: 1,
          failed: 0,
          blocked: 0,
        },
      ]);
    });

    it("orders same-millisecond evidence by the database append sequence", async () => {
      const prId = await store.upsertPullRequest(pr());
      const reviewId = await store.saveReview(review({ prId }));
      const requirementId = (await store.loadReview(reviewId))!
        .verificationRequirements[0].id;
      const clock = vi.spyOn(Date, "now").mockReturnValue(T0);

      try {
        for (let i = 0; i < 11; i += 1) {
          await store.recordVerification({
            requirementId,
            actorLogin: `reviewer-${i}`,
            result: i === 10 ? "verified" : "failed",
            evidenceKind: "manual_observation",
          });
        }
      } finally {
        clock.mockRestore();
      }

      const entries = await store.listVerificationEntries(reviewId);
      expect(entries.map((entry) => entry.actorLogin)).toEqual(
        Array.from({ length: 11 }, (_, i) => `reviewer-${i}`),
      );
      expect((await store.loadReview(reviewId))?.verifications).toMatchObject([
        { requirementId, result: "verified", actorLogin: "reviewer-10" },
      ]);
    });

    it("accepts concurrent evidence submissions without id collisions", async () => {
      const prId = await store.upsertPullRequest(pr());
      const reviewId = await store.saveReview(review({ prId }));
      const requirementId = (await store.loadReview(reviewId))!
        .verificationRequirements[0].id;
      const clock = vi.spyOn(Date, "now").mockReturnValue(T0);

      try {
        await Promise.all(
          Array.from({ length: 12 }, (_, i) =>
            store.recordVerification({
              requirementId,
              actorLogin: `reviewer-${i}`,
              result: "verified",
              evidenceKind: "manual_observation",
            }),
          ),
        );
      } finally {
        clock.mockRestore();
      }

      const entries = await store.listVerificationEntries(reviewId);
      expect(entries).toHaveLength(12);
      expect(new Set(entries.map((entry) => entry.id)).size).toBe(12);
    });

    it("does not reassign evidence when a same-head review changes its plan", async () => {
      const prId = await store.upsertPullRequest(pr());
      const reviewId = await store.saveReview(review({ prId }));
      const first = (await store.loadReview(reviewId))!.verificationRequirements[0];
      await store.recordVerification({
        requirementId: first.id,
        actorLogin: "renata",
        result: "verified",
        evidenceKind: "manual_observation",
      });

      await store.saveReview(
        review({
          prId,
          verificationRequirements: [
            {
              title: "A different result is visible.",
              instruction: "Open the changed screen.",
              expectedResult: "The new result appears.",
              evidenceKinds: ["manual_observation"],
              required: true,
            },
          ],
        }),
      );

      const current = await store.loadReview(reviewId);
      expect(current?.verificationRequirements[0].id).not.toBe(first.id);
      expect(current?.verifications).toEqual([]);
      expect(await store.listVerificationEntries(reviewId)).toHaveLength(1);
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

      it("skips anything not open", async () => {
        await store.upsertPullRequest(pr({ number: 3, state: "merged" }));
        await store.upsertPullRequest(pr({ number: 4, state: "closed" }));
        expect(await store.listPullRequestsNeedingReview()).toHaveLength(0);
      });

      it("offers drafts — whether to review one is a setting, not a query", async () => {
        // The exclusion used to live in this WHERE clause, which made
        // auto_review.drafts unreachable. shouldReview() decides now.
        await store.upsertPullRequest(pr({ number: 2, isDraft: true }));
        const pending = await store.listPullRequestsNeedingReview();
        expect(pending.map((p) => p.number)).toContain(2);
      });

      it("treats a skipped head as settled, so it is not re-offered forever", async () => {
        const prId = await store.upsertPullRequest(pr({ number: 5 }));
        await store.upsertJudgment({
          prId, headSha: "aaa111", verdict: null,
          status: "skipped", impact: "low", score: 0,
        });
        const pending = await store.listPullRequestsNeedingReview();
        expect(pending.map((p) => p.number)).not.toContain(5);
      });

      it("stops offering a re-review when the caller asks it not to", async () => {
        // auto_review.on_new_commits: false. The first head was reviewed, the
        // second is new — and without this the poller would review it anyway.
        const prId = await store.upsertPullRequest(pr({ number: 7 }));
        await store.upsertJudgment({
          prId, headSha: "aaa111", verdict: "ship",
          status: "completed", impact: "low", score: 90,
        });
        await store.upsertPullRequest(pr({ number: 7, headSha: "bbb222" }));

        const withRe = await store.listPullRequestsNeedingReview();
        expect(withRe.map((p) => p.number)).toContain(7);

        const withoutRe = await store.listPullRequestsNeedingReview({
          reReview: false,
        });
        expect(withoutRe.map((p) => p.number)).not.toContain(7);
      });

      it("still offers a first review when re-reviews are off", async () => {
        await store.upsertPullRequest(pr({ number: 8 }));
        const pending = await store.listPullRequestsNeedingReview({
          reReview: false,
        });
        expect(pending.map((p) => p.number)).toContain(8);
      });

      it("re-offers a head whose review errored", async () => {
        const prId = await store.upsertPullRequest(pr({ number: 6 }));
        await store.upsertJudgment({
          prId, headSha: "aaa111", verdict: null,
          status: "error", impact: "low", score: 0,
        });
        const pending = await store.listPullRequestsNeedingReview();
        expect(pending.map((p) => p.number)).toContain(6);
      });
    });

    it("returns findings in a stable order, not the engine's", async () => {
      // Every finding in a batch is written with one timestamp, so ordering on
      // createdAt alone has no tiebreak: SQLite happened to return insert
      // order and Postgres did not. Two drivers rendering the same review's
      // findings differently is exactly what conformance exists to catch.
      const prId = await store.upsertPullRequest(pr());
      const judgmentId = await store.upsertJudgment({
        prId, headSha: "aaa111", verdict: "needs_work",
        status: "completed", impact: "high", score: 40,
      });

      // More than ten, so a lexical sort on the id suffix would also break.
      const paths = Array.from({ length: 12 }, (_, i) => `src/f${i}.ts`);
      await store.replaceFindings(
        judgmentId,
        paths.map((filePath, i) => ({
          title: `Finding ${i}`,
          body: "…",
          severity: "P2" as const,
          isSecurity: false,
          filePath,
        })),
      );

      const { findings } = await store.snapshot();
      expect(findings.map((f) => f.filePath)).toEqual(paths);
      expect(findings.map((f) => f.ordinal)).toEqual(paths.map((_, i) => i));
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
      expect((await store.listAIReviewJobs())[0]).toMatchObject({
        id: judgmentId,
        state: "queued",
        trigger: "manual",
      });
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

    /* ── The review body ───────────────────────────────────────────────── */

    it("round-trips a review body through both dialects", async () => {
      const prId = await store.upsertPullRequest(pr());
      const reviewId = await store.saveReview(review({ prId }));

      const loaded = await store.loadReview(reviewId);
      expect(loaded).not.toBeNull();
      expect(loaded!.review.confidence).toBe(3);
      expect(loaded!.review.effort).toBe(2);
      expect(loaded!.review.diagram).toBe("sequenceDiagram\n  A->>B: hi");
      // The JSON columns are where the two dialects diverge — TEXT here,
      // JSONB there — so this is the assertion that keeps them honest.
      expect(loaded!.review.walkthrough).toEqual([
        { files: ["auth/session.ts"], summary: "Rotates the token." },
      ]);
      expect(loaded!.judgements).toHaveLength(2);
      expect(loaded!.judgements[0].options).toHaveLength(4);
      expect(loaded!.judgements[0].options[0]).toEqual({
        label: "Yes — fifteen minutes is fine",
        bucket: "Agreed",
      });
      expect(loaded!.judgements[0].sources).toEqual(["the diff"]);
      expect(loaded!.judgements[0].endLine).toBeNull();
      expect(loaded!.judgements[0].suggestion).toBe("await cache.revoke(id)");
    });

    it("keeps judgements GitHub could not have anchored", async () => {
      const prId = await store.upsertPullRequest(pr());
      const reviewId = await store.saveReview(review({ prId }));

      const loaded = await store.loadReview(reviewId);
      expect(loaded!.judgements.map((j) => j.postable)).toEqual([true, false]);
    });

    it("numbers judgements by position, so a URL can name one", async () => {
      const prId = await store.upsertPullRequest(pr());
      const reviewId = await store.saveReview(review({ prId }));

      const loaded = await store.loadReview(reviewId);
      expect(loaded!.judgements.map((j) => j.ordinal)).toEqual([0, 1]);
      expect(loaded!.judgements[1].id).toBe(`${reviewId}:1`);
    });

    it("keeps every run rather than overwriting the last one", async () => {
      const prId = await store.upsertPullRequest(pr());
      const first = await store.saveReview(review({ prId, headSha: "aaa111" }));
      const second = await store.saveReview(
        review({ prId, headSha: "bbb222", confidence: 5 }),
      );

      expect(second).not.toBe(first);
      const runs = await store.listReviewRuns(prId);
      expect(runs).toHaveLength(2);
      // Newest first, and the older run is still readable in full.
      expect(runs[0].id).toBe(second);
      expect((await store.loadReview(first))!.review.confidence).toBe(3);
      expect((await store.loadLatestReview(prId))!.review.id).toBe(second);
    });

    it("replaces a re-run of the same head instead of duplicating it", async () => {
      const prId = await store.upsertPullRequest(pr());
      const a = await store.saveReview(review({ prId }));
      const b = await store.saveReview(review({ prId, confidence: 1 }));

      expect(b).toBe(a);
      expect(await store.listReviewRuns(prId)).toHaveLength(1);
      const loaded = await store.loadReview(a);
      expect(loaded!.review.confidence).toBe(1);
      expect(loaded!.judgements).toHaveLength(2);
    });

    it("remembers a posted receipt, and a re-run of the head does not forget it", async () => {
      const prId = await store.upsertPullRequest(pr());
      const reviewId = await store.saveReview(review({ prId }));

      expect((await store.loadReview(reviewId))!.review.receiptUrl).toBeNull();

      await store.markReceiptPosted(reviewId, "https://github.com/x/y#c1");
      const posted = (await store.loadReview(reviewId))!.review;
      expect(posted.receiptUrl).toBe("https://github.com/x/y#c1");
      expect(posted.receiptPostedAt).toBeGreaterThan(0);

      // Re-reviewing the same head rewrites the body, but the fact that a
      // person closed this run out is theirs and not the reviewer's to drop.
      await store.saveReview(review({ prId, confidence: 1 }));
      const after = (await store.loadReview(reviewId))!.review;
      expect(after.confidence).toBe(1);
      expect(after.receiptUrl).toBe("https://github.com/x/y#c1");
    });

    it("stores patches out of the way, read only when asked for", async () => {
      const prId = await store.upsertPullRequest(pr());
      const reviewId = await store.saveReview(review({ prId }));

      const files = await store.loadReviewFiles(reviewId);
      expect(files).toHaveLength(1);
      expect(files[0].patch).toContain("@@");
      expect(files[0].additions).toBe(12);
    });

    it("appends answers and never rewrites one", async () => {
      const prId = await store.upsertPullRequest(pr());
      const reviewId = await store.saveReview(review({ prId }));
      const judgementId = `${reviewId}:0`;

      await store.recordAnswer({
        judgementId, actorLogin: "renata",
        bucket: "Agreed", optionLabel: "Yes — fifteen minutes is fine",
      });
      await store.recordAnswer({
        judgementId, actorLogin: "renata",
        bucket: "Blocks", optionLabel: "No — revoke the cache entry",
      });

      // Both are on the record...
      const ledger = await store.listAnswers(reviewId);
      expect(ledger).toHaveLength(2);
      expect(ledger.map((a) => a.bucket)).toEqual(["Agreed", "Blocks"]);

      // ...and the newest is the answer.
      const loaded = await store.loadReview(reviewId);
      expect(loaded!.answers).toHaveLength(1);
      expect(loaded!.answers[0].bucket).toBe("Blocks");
      expect(loaded!.answers[0].actorLogin).toBe("renata");
    });

    it("withdraws an answer by appending, not by deleting", async () => {
      const prId = await store.upsertPullRequest(pr());
      const reviewId = await store.saveReview(review({ prId }));
      const judgementId = `${reviewId}:0`;

      await store.recordAnswer({
        judgementId, actorLogin: "renata", bucket: "Agreed", optionLabel: "Yes",
      });
      await store.recordAnswer({
        judgementId, actorLogin: "renata", bucket: null,
      });

      expect(await store.listAnswers(reviewId)).toHaveLength(2);
      const loaded = await store.loadReview(reviewId);
      expect(loaded!.answers[0].bucket).toBeNull();
    });

    it("carries the note and the blocking flag of an asked question", async () => {
      const prId = await store.upsertPullRequest(pr());
      const reviewId = await store.saveReview(review({ prId }));

      await store.recordAnswer({
        judgementId: `${reviewId}:1`, actorLogin: "kai",
        bucket: "Asked", optionLabel: "I have a question first",
        note: "Does the edge cache honour the revocation?", blocking: true,
      });

      const loaded = await store.loadReview(reviewId);
      expect(loaded!.answers[0].note).toBe(
        "Does the edge cache honour the revocation?",
      );
      expect(loaded!.answers[0].blocking).toBe(true);
    });

    it("keeps answers when the same head is reviewed again", async () => {
      const prId = await store.upsertPullRequest(pr());
      const reviewId = await store.saveReview(review({ prId }));
      await store.recordAnswer({
        judgementId: `${reviewId}:0`, actorLogin: "renata", bucket: "Agreed",
        optionLabel: "Yes",
      });

      await store.saveReview(review({ prId, confidence: 1 }));

      const loaded = await store.loadReview(reviewId);
      expect(loaded!.answers).toHaveLength(1);
      expect(loaded!.answers[0].bucket).toBe("Agreed");
    });

    it("reports nothing rather than throwing for a pull request never reviewed", async () => {
      const prId = await store.upsertPullRequest(pr());
      expect(await store.loadLatestReview(prId)).toBeNull();
      expect(await store.loadReview("acme/api#1@nope")).toBeNull();
      expect(await store.listReviewRuns(prId)).toEqual([]);
    });

    /* ── API keys ─────────────────────────────────────────────────────── */

    describe("superseding a job whose work was done elsewhere", () => {
      it("settles a queued job that nobody has leased", async () => {
        await store.upsertPullRequest(pr());
        const jobId = await store.requestAIReview({
          prId: "acme/api#1",
          headSha: "aaa111",
          trigger: "new_pull_request",
          requestedAt: T0,
        });

        // The lease-holding path cannot do this: it requires state 'running'
        // and a matching worker, and a queued job has neither.
        expect(await store.supersedeAIReviewJob(jobId, T0 + 1000)).toBe(true);
        const [job] = await store.listAIReviewJobs();
        expect(job.state).toBe("completed");
        expect(job.workerId).toBeNull();
      });

      it("settles a job leased by a worker that is not the caller", async () => {
        await store.upsertPullRequest(pr());
        const jobId = await store.requestAIReview({
          prId: "acme/api#1",
          headSha: "aaa111",
          trigger: "new_pull_request",
          requestedAt: T0,
        });
        await store.claimNextAIReview({ workerId: "worker-a", now: T0, leaseMs: 60_000 });

        expect(await store.supersedeAIReviewJob(jobId, T0 + 1000)).toBe(true);
        expect((await store.listAIReviewJobs())[0].state).toBe("completed");
      });

      it("leaves a job that already finished exactly as it finished", async () => {
        await store.upsertPullRequest(pr());
        const jobId = await store.requestAIReview({
          prId: "acme/api#1",
          headSha: "aaa111",
          trigger: "new_pull_request",
          requestedAt: T0,
        });
        await store.claimNextAIReview({ workerId: "worker-a", now: T0, leaseMs: 60_000 });
        await store.finishAIReviewJob({
          jobId,
          workerId: "worker-a",
          state: "failed",
          finishedAt: T0 + 1,
          error: "provider timed out",
        });

        // A run that actually happened keeps its outcome. Rewriting a failure
        // as a success would erase the only record that the provider broke.
        expect(await store.supersedeAIReviewJob(jobId, T0 + 1000)).toBe(false);
        expect((await store.listAIReviewJobs())[0]).toMatchObject({
          state: "failed",
          lastError: "provider timed out",
        });
      });

      it("reports nothing settled for a job that does not exist", async () => {
        expect(await store.supersedeAIReviewJob("acme/api#1@nope", T0)).toBe(false);
      });
    });

    /* ── Check rollups ────────────────────────────────────────────────── */

    describe("check rollups", () => {
      // Observed just now, not at T0. A rollup carries an age and stops being
      // shown once it is a day old — see readChecks — so a fixture pinned to a
      // fixed past timestamp would test the expiry rule by accident on every
      // other assertion.
      const RECENT = Date.now() - 60_000;
      const rollup = (over: Record<string, unknown> = {}) => ({
        headSha: "aaa111",
        state: "passing" as const,
        failing: [] as string[],
        total: 3,
        passed: 3,
        pending: 0,
        observedAt: RECENT,
        ...over,
      });

      it("reads back nothing before anything has been observed", async () => {
        await store.upsertPullRequest(pr());
        const [row] = await store.listPullRequests();
        // Not a zeroed rollup: "no checks have been read" and "no checks
        // failed" are different sentences and only one of them is true here.
        expect(row.checks).toBeNull();
      });

      it("round-trips a rollup for the current head", async () => {
        await store.upsertPullRequest(pr());
        await store.recordPullRequestChecks("acme/api#1", rollup());

        const [row] = await store.listPullRequests();
        expect(row.checks).toEqual(rollup());
      });

      it("carries the failing check names", async () => {
        await store.upsertPullRequest(pr());
        await store.recordPullRequestChecks(
          "acme/api#1",
          rollup({ state: "failing", passed: 1, total: 3, failing: ["build", "lint"] }),
        );

        const [row] = await store.listPullRequests();
        expect(row.checks?.state).toBe("failing");
        expect(row.checks?.failing).toEqual(["build", "lint"]);
      });

      it("keeps a rollup whose detail was never fetched, without inventing counts", async () => {
        // The cheap query answers the state for a whole repository at once and
        // returns no counts. A screen showing "0 checks" for a commit nobody
        // counted would be making a number up.
        await store.upsertPullRequest(pr());
        await store.recordPullRequestChecks("acme/api#1", {
          headSha: "aaa111",
          state: "failing",
          failing: [],
          total: null,
          passed: null,
          pending: null,
          observedAt: RECENT,
        });

        const [row] = await store.listPullRequests();
        expect(row.checks?.state).toBe("failing");
        expect(row.checks?.total).toBeNull();
        expect(row.checks?.passed).toBeNull();
      });

      it("stops showing an observation old enough to be describing the past", async () => {
        // A repository can stop being readable — renamed, gone private, the
        // GraphQL budget spent — and the poller then writes nothing rather
        // than writing a wrong answer. Without an age bound the last green
        // pill stays on screen against an unmoved head indefinitely, which is
        // the same lie the head check exists to prevent by a different road.
        await store.upsertPullRequest(pr());
        await store.recordPullRequestChecks(
          "acme/api#1",
          rollup({ observedAt: Date.now() - 25 * 60 * 60 * 1000 }),
        );

        const [row] = await store.listPullRequests();
        expect(row.checks).toBeNull();
      });

      it("counts the failures back from their names rather than storing them", async () => {
        await store.upsertPullRequest(pr());
        // A caller whose `failed` disagrees with `failing` — the drift a stored
        // counter makes possible. The names are the record; the count follows.
        await store.recordPullRequestChecks(
          "acme/api#1",
          rollup({
            state: "failing",
            passed: 1,
            pending: 1,
            total: 4321,
            failing: ["build", "lint"],
          }),
        );

        const [row] = await store.listPullRequests();
        // Counted back from the names, so the stored total cannot disagree
        // with the row that produced it.
        expect(row.checks?.total).toBe(4);
        expect(row.checks?.failing).toHaveLength(2);
      });

      it("hides a rollup once the head has moved past it", async () => {
        await store.upsertPullRequest(pr());
        await store.recordPullRequestChecks("acme/api#1", rollup());
        // A push. The rollup still describes aaa111, which is no longer what
        // would merge — showing it green would be the worst thing this column
        // could do.
        await store.upsertPullRequest(pr({ headSha: "bbb222" }));

        const [row] = await store.listPullRequests();
        expect(row.checks).toBeNull();
      });

      it("shows it again once the new head has been observed", async () => {
        await store.upsertPullRequest(pr());
        await store.recordPullRequestChecks("acme/api#1", rollup());
        await store.upsertPullRequest(pr({ headSha: "bbb222" }));
        await store.recordPullRequestChecks(
          "acme/api#1",
          rollup({ headSha: "bbb222", state: "pending", passed: 1, pending: 2, total: 3 }),
        );

        const [row] = await store.listPullRequests();
        expect(row.checks?.headSha).toBe("bbb222");
        expect(row.checks?.state).toBe("pending");
      });

      it("erases the rollup when the caller can no longer read one", async () => {
        await store.upsertPullRequest(pr());
        await store.recordPullRequestChecks("acme/api#1", rollup());
        await store.recordPullRequestChecks("acme/api#1", null);

        const [row] = await store.listPullRequests();
        expect(row.checks).toBeNull();
      });

      it("survives the inventory upsert that follows it", async () => {
        // The listing pass rewrites the row every time something moves, and it
        // knows nothing about checks. If it could blank them, the column would
        // flicker empty on every poll.
        await store.upsertPullRequest(pr());
        await store.recordPullRequestChecks("acme/api#1", rollup());
        await store.upsertPullRequest(pr({ title: "Renamed", updatedAt: T0 + 1000 }));

        const [row] = await store.listPullRequests();
        expect(row.checks?.state).toBe("passing");
      });

      it("is on the shared snapshot, which is what the queue renders", async () => {
        await store.upsertPullRequest(pr());
        await store.recordPullRequestChecks("acme/api#1", rollup());

        const snapshot = await store.snapshot();
        expect(snapshot.pullRequests[0].checks?.passed).toBe(3);
      });
    });

    /* ── Cached conversations ─────────────────────────────────────────── */

    describe("pull request conversations", () => {
      const comment = (over: Record<string, unknown> = {}) => ({
        kind: "issue" as const,
        externalId: 1,
        inReplyToId: null,
        author: "renata",
        body: "Does this handle the empty case?",
        path: null,
        line: null,
        state: null,
        url: "https://github.com/acme/api/pull/1#issuecomment-1",
        createdAt: T0,
        updatedAt: T0,
        ...over,
      });

      it("reports null before anyone has read the conversation", async () => {
        await store.upsertPullRequest(pr());
        expect(await store.loadPullRequestConversation("acme/api#1")).toBeNull();
      });

      it("distinguishes an empty conversation from an unread one", async () => {
        await store.upsertPullRequest(pr());
        await store.replacePullRequestComments("acme/api#1", [], T0);

        const loaded = await store.loadPullRequestConversation("acme/api#1");
        // The whole reason observedAt is stored: otherwise a pull request with
        // no comments is re-fetched from GitHub on every single view.
        expect(loaded).not.toBeNull();
        expect(loaded?.comments).toEqual([]);
        expect(loaded?.observedAt).toBe(T0);
      });

      it("round-trips the three kinds and their anchors", async () => {
        await store.upsertPullRequest(pr());
        await store.replacePullRequestComments(
          "acme/api#1",
          [
            comment(),
            comment({
              kind: "review",
              externalId: 2,
              path: "auth/session.ts",
              line: 88,
              createdAt: T0 + 1,
            }),
            comment({
              kind: "review_summary",
              externalId: 3,
              state: "CHANGES_REQUESTED",
              createdAt: T0 + 2,
            }),
          ],
          T0 + 10,
        );

        const loaded = await store.loadPullRequestConversation("acme/api#1");
        expect(loaded?.comments.map((c) => c.kind)).toEqual([
          "issue",
          "review",
          "review_summary",
        ]);
        expect(loaded?.comments[1]).toMatchObject({
          path: "auth/session.ts",
          line: 88,
        });
        expect(loaded?.comments[2].state).toBe("CHANGES_REQUESTED");
        expect(loaded?.comments[0].path).toBeNull();
      });

      it("keeps replies pointing at what they answer", async () => {
        await store.upsertPullRequest(pr());
        await store.replacePullRequestComments(
          "acme/api#1",
          [
            comment({ kind: "review", externalId: 2, path: "a.ts", line: 3 }),
            comment({
              kind: "review",
              externalId: 4,
              inReplyToId: 2,
              path: "a.ts",
              line: 3,
              createdAt: T0 + 5,
            }),
          ],
          T0 + 10,
        );

        const loaded = await store.loadPullRequestConversation("acme/api#1");
        expect(loaded?.comments[1].inReplyToId).toBe(2);
      });

      it("derives an id that survives re-reading the same conversation", async () => {
        await store.upsertPullRequest(pr());
        await store.replacePullRequestComments("acme/api#1", [comment()], T0);
        const first = await store.loadPullRequestConversation("acme/api#1");

        await store.replacePullRequestComments("acme/api#1", [comment()], T0 + 60_000);
        const second = await store.loadPullRequestConversation("acme/api#1");

        expect(second?.comments).toHaveLength(1);
        expect(second?.comments[0].id).toBe(first?.comments[0].id);
      });

      it("replaces rather than merges, so a deleted comment stops existing", async () => {
        await store.upsertPullRequest(pr());
        await store.replacePullRequestComments(
          "acme/api#1",
          [comment(), comment({ externalId: 2, createdAt: T0 + 1 })],
          T0,
        );
        await store.replacePullRequestComments("acme/api#1", [comment()], T0 + 60_000);

        const loaded = await store.loadPullRequestConversation("acme/api#1");
        expect(loaded?.comments.map((c) => c.externalId)).toEqual([1]);
        expect(loaded?.observedAt).toBe(T0 + 60_000);
      });

      it("keeps a torn write from leaving a cache that lies about being current", async () => {
        await store.upsertPullRequest(pr());
        await store.replacePullRequestComments("acme/api#1", [comment()], T0);

        // The second row is unstorable. Without a transaction the delete has
        // already landed, so the conversation loses its existing comment and
        // keeps the old observedAt — a truncated cache that looks like a
        // complete read and is never refetched.
        await expect(
          store.replacePullRequestComments(
            "acme/api#1",
            [
              comment({ externalId: 5, body: "fine" }),
              comment({ externalId: 6, body: null as unknown as string }),
            ],
            T0 + 60_000,
          ),
        ).rejects.toThrow();

        const loaded = await store.loadPullRequestConversation("acme/api#1");
        expect(loaded?.comments.map((c) => c.externalId)).toEqual([1]);
        expect(loaded?.observedAt).toBe(T0);
      });

      it("takes the last of two comments that derive the same id, whole", async () => {
        await store.upsertPullRequest(pr());
        await store.replacePullRequestComments(
          "acme/api#1",
          [
            comment({ author: "renata", body: "first", url: "u1" }),
            comment({ author: "kai", body: "second", url: "u2", updatedAt: T0 + 2 }),
          ],
          T0,
        );

        const loaded = await store.loadPullRequestConversation("acme/api#1");
        // One row, and every field from the same comment. Merging them field by
        // field would attribute one person's words to the other's name.
        expect(loaded?.comments).toHaveLength(1);
        expect(loaded?.comments[0]).toMatchObject({
          author: "kai",
          body: "second",
          url: "u2",
        });
      });

      it("keeps one pull request's conversation out of another's", async () => {
        await store.upsertPullRequest(pr());
        await store.upsertPullRequest(pr({ number: 2 }));
        await store.replacePullRequestComments("acme/api#1", [comment()], T0);

        expect(await store.loadPullRequestConversation("acme/api#2")).toBeNull();
      });
    });

    /* ── Personal GitHub credentials ──────────────────────────────────── */

    describe("member github identities", () => {
      const MEMBER = { login: "renata" };
      let memberId: string;

      beforeEach(async () => {
        memberId = await store.saveMember({
          email: "renata@acme.com",
          name: "Renata",
          githubLogin: MEMBER.login,
          role: "member",
          avatarSeed: "renata",
          isYou: false,
        });
      });

      it("stores a token and never lists it", async () => {
        await store.saveGithubIdentity({ memberId, login: "renata", token: "ghp_secret" });

        const [listed] = await store.listGithubIdentities();
        expect(listed).toMatchObject({ memberId, login: "renata", lastError: null });
        // An approval posted with someone else's credential is the failure
        // this separation exists to make impossible.
        expect(listed).not.toHaveProperty("token");
      });

      it("hands the token to the one caller that acts as the person", async () => {
        await store.saveGithubIdentity({ memberId, login: "renata", token: "ghp_secret" });
        const loaded = await store.loadGithubToken(memberId);

        expect(loaded?.token).toBe("ghp_secret");
        expect(loaded?.identity.login).toBe("renata");
      });

      it("keeps one credential per member — reconnecting replaces", async () => {
        await store.saveGithubIdentity({ memberId, login: "renata", token: "first" });
        await store.saveGithubIdentity({ memberId, login: "renata", token: "second" });

        expect(await store.listGithubIdentities()).toHaveLength(1);
        expect((await store.loadGithubToken(memberId))?.token).toBe("second");
      });

      it("records a failure and clears it on reconnect", async () => {
        await store.saveGithubIdentity({ memberId, login: "renata", token: "revoked" });
        await store.setGithubIdentityError(memberId, "401 Bad credentials");
        expect((await store.listGithubIdentities())[0].lastError).toBe(
          "401 Bad credentials",
        );

        await store.saveGithubIdentity({ memberId, login: "renata", token: "fresh" });
        expect((await store.listGithubIdentities())[0].lastError).toBeNull();
      });

      it("clears an error without reconnecting", async () => {
        await store.saveGithubIdentity({ memberId, login: "renata", token: "tok" });
        await store.setGithubIdentityError(memberId, "401 Bad credentials");
        await store.setGithubIdentityError(memberId, null);

        expect((await store.listGithubIdentities())[0].lastError).toBeNull();
      });

      it("disconnects, and the token goes with it", async () => {
        await store.saveGithubIdentity({ memberId, login: "renata", token: "tok" });
        await store.deleteGithubIdentity(memberId);

        expect(await store.listGithubIdentities()).toHaveLength(0);
        expect(await store.loadGithubToken(memberId)).toBeNull();
      });

      it("reports nothing for a member who never connected", async () => {
        expect(await store.loadGithubToken(memberId)).toBeNull();
      });

      it("is on the shared snapshot, so a screen knows before it renders", async () => {
        await store.saveGithubIdentity({ memberId, login: "renata", token: "tok" });
        const snapshot = await store.snapshot();

        expect(snapshot.githubIdentities).toHaveLength(1);
        expect(snapshot.githubIdentities[0]).not.toHaveProperty("token");
      });

      it("forgets the credential when the member leaves the roster", async () => {
        await store.saveGithubIdentity({ memberId, login: "renata", token: "tok" });
        await store.removeMember(memberId);

        expect(await store.listGithubIdentities()).toHaveLength(0);
      });
    });

    describe("api keys", () => {
      const key = (over: Record<string, unknown> = {}) => ({
        name: "CI pipeline",
        keyHash: "a".repeat(64),
        prefix: "kmd_abcd1234",
        ...over,
      });

      it("stores a key and hands back everything but the secret", async () => {
        const created = await store.createApiKey(key());
        expect(created.name).toBe("CI pipeline");
        expect(created.prefix).toBe("kmd_abcd1234");
        expect(created.lastUsedAt).toBeNull();
        // The hash is a storage detail and must not travel back out.
        expect(created).not.toHaveProperty("keyHash");
      });

      it("never returns the hash when listing", async () => {
        await store.createApiKey(key());
        const [listed] = await store.listApiKeys();
        expect(Object.keys(listed).sort()).toEqual([
          "createdAt", "id", "lastUsedAt", "name", "prefix",
        ]);
      });

      it("finds a key by its hash and nothing else", async () => {
        const created = await store.createApiKey(key());
        expect((await store.findApiKeyByHash("a".repeat(64)))?.id).toBe(created.id);
        expect(await store.findApiKeyByHash("b".repeat(64))).toBeNull();
      });

      it("records when a key was last used, on the lookup itself", async () => {
        // Recorded by the store rather than the caller: a lastUsedAt that
        // depends on remembering to write it is one nobody can trust.
        await store.createApiKey(key());
        expect((await store.listApiKeys())[0].lastUsedAt).toBeNull();

        await store.findApiKeyByHash("a".repeat(64));
        expect((await store.listApiKeys())[0].lastUsedAt).not.toBeNull();
      });

      it("revokes a key", async () => {
        const created = await store.createApiKey(key());
        await store.deleteApiKey(created.id);

        expect(await store.listApiKeys()).toHaveLength(0);
        // And it stops authenticating, which is the point of revoking.
        expect(await store.findApiKeyByHash("a".repeat(64))).toBeNull();
      });
    });

    /* ── Integrations ─────────────────────────────────────────────────── */

    describe("integrations", () => {
      it("stores a token and never lists it", async () => {
        await store.saveIntegration({ provider: "linear", token: "lin_secret" });

        const [listed] = await store.listIntegrations();
        expect(listed).toMatchObject({ provider: "linear", status: "connected" });
        // The one property that must never leave by this path.
        expect(listed).not.toHaveProperty("token");
      });

      it("hands the token to the one caller that needs it", async () => {
        await store.saveIntegration({ provider: "linear", token: "lin_secret" });
        const loaded = await store.loadIntegrationToken("linear");
        expect(loaded?.token).toBe("lin_secret");
      });

      it("keeps one row per provider — reconnecting replaces", async () => {
        await store.saveIntegration({ provider: "linear", token: "first" });
        await store.saveIntegration({ provider: "linear", token: "second" });

        expect(await store.listIntegrations()).toHaveLength(1);
        expect((await store.loadIntegrationToken("linear"))?.token).toBe("second");
      });

      it("carries the site and account a Jira connection needs", async () => {
        await store.saveIntegration({
          provider: "jira",
          token: "tok",
          baseUrl: "https://acme.atlassian.net",
          account: "renata@acme.com",
        });
        const [listed] = await store.listIntegrations();
        expect(listed.baseUrl).toBe("https://acme.atlassian.net");
        expect(listed.account).toBe("renata@acme.com");
      });

      it("records a failure and clears it on the next success", async () => {
        await store.saveIntegration({ provider: "linear", token: "tok" });

        await store.setIntegrationError("linear", "401 Unauthorized");
        expect((await store.listIntegrations())[0]).toMatchObject({
          status: "error",
          lastError: "401 Unauthorized",
        });

        await store.setIntegrationError("linear", null);
        expect((await store.listIntegrations())[0]).toMatchObject({
          status: "connected",
          lastError: null,
        });
      });

      it("reconnecting clears a previous error", async () => {
        await store.saveIntegration({ provider: "linear", token: "bad" });
        await store.setIntegrationError("linear", "401 Unauthorized");
        await store.saveIntegration({ provider: "linear", token: "good" });

        expect((await store.listIntegrations())[0]).toMatchObject({
          status: "connected",
          lastError: null,
        });
      });

      it("disconnects, and the token goes with it", async () => {
        await store.saveIntegration({ provider: "linear", token: "tok" });
        await store.disconnectIntegration("linear");

        expect(await store.listIntegrations()).toHaveLength(0);
        expect(await store.loadIntegrationToken("linear")).toBeNull();
      });

      it("reports nothing for a provider never connected", async () => {
        expect(await store.loadIntegrationToken("jira")).toBeNull();
      });
    });

    /* ── Custom context ───────────────────────────────────────────────── */

    describe("custom context", () => {
      const rule = (over: Record<string, unknown> = {}) => ({
        description: "Currency amounts must be integer minor units",
        kind: "rule" as const,
        pattern: "Use amountCents, never a float",
        repoId: null,
        fileGlob: "",
        status: "active" as const,
        ...over,
      });

      it("round-trips a rule", async () => {
        const id = await store.saveMemoryRule(rule());
        const [saved] = await store.listMemoryRules();
        expect(saved.id).toBe(id);
        expect(saved.pattern).toBe("Use amountCents, never a float");
        expect(saved.repoId).toBeNull();
      });

      it("updates in place rather than duplicating", async () => {
        const id = await store.saveMemoryRule(rule());
        await store.saveMemoryRule({ ...rule({ status: "inactive" }), id });

        const rules = await store.listMemoryRules();
        expect(rules).toHaveLength(1);
        expect(rules[0].status).toBe("inactive");
      });

      it("starts a rule with no usage rather than an invented one", async () => {
        await store.saveMemoryRule(rule());
        expect(await store.listMemoryRules()).toMatchObject([
          { usageCount: 0, usesThisMonth: 0, acceptanceRate: null },
        ]);
      });

      it("counts a rule's uses from the runs it was given to", async () => {
        const id = await store.saveMemoryRule(rule());
        const prId = await store.upsertPullRequest(pr());
        const reviewId = await store.saveReview(review({ prId }));

        await store.recordMemoryUse(reviewId, [{ ruleId: id }]);
        expect((await store.listMemoryRules())[0]).toMatchObject({
          usageCount: 1,
          usesThisMonth: 1,
        });

        // Recording the same run twice is not two uses.
        await store.recordMemoryUse(reviewId, [{ ruleId: id }]);
        expect((await store.listMemoryRules())[0].usageCount).toBe(1);
      });

      it("reads acceptance off the answers to the runs it informed", async () => {
        const id = await store.saveMemoryRule(rule());
        const prId = await store.upsertPullRequest(pr());
        const reviewId = await store.saveReview(review({ prId }));
        await store.recordMemoryUse(reviewId, [{ ruleId: id }]);

        await store.recordAnswer({
          judgementId: `${reviewId}:0`, actorLogin: "renata",
          bucket: "Agreed", optionLabel: "Yes",
        });
        await store.recordAnswer({
          judgementId: `${reviewId}:1`, actorLogin: "renata",
          bucket: "Passed on", optionLabel: "Not my call",
        });

        expect((await store.listMemoryRules())[0].acceptanceRate).toBe(0.5);
      });

      it("counts the files a file rule has actually resolved to", async () => {
        // The knowledge base. Only the ingester has a checkout, so what it
        // read is recorded rather than re-matched at read time.
        const id = await store.saveMemoryRule(
          rule({ kind: "file", pattern: "AGENTS.md" }),
        );
        const prId = await store.upsertPullRequest(pr());
        const one = await store.saveReview(review({ prId }));
        const two = await store.saveReview(review({ prId, headSha: "bbb222" }));

        await store.recordMemoryUse(one, [
          { ruleId: id, paths: ["AGENTS.md", "packages/api/AGENTS.md"] },
        ]);
        await store.recordMemoryUse(two, [{ ruleId: id, paths: ["AGENTS.md"] }]);

        const [saved] = await store.listMemoryRules();
        expect(saved.files).toEqual([
          { path: "AGENTS.md", uses: 2 },
          { path: "packages/api/AGENTS.md", uses: 1 },
        ]);
      });

      it("gives a text rule no files, rather than inventing some", async () => {
        const id = await store.saveMemoryRule(rule());
        const prId = await store.upsertPullRequest(pr());
        const reviewId = await store.saveReview(review({ prId }));
        await store.recordMemoryUse(reviewId, [{ ruleId: id }]);

        expect((await store.listMemoryRules())[0].files).toEqual([]);
      });

      it("keeps the history of a deleted rule's uses", async () => {
        // Deleting a rule must not rewrite what past reviews were given.
        const id = await store.saveMemoryRule(rule());
        const prId = await store.upsertPullRequest(pr());
        const reviewId = await store.saveReview(review({ prId }));
        await store.recordMemoryUse(reviewId, [{ ruleId: id }]);

        await store.deleteMemoryRule(id);
        expect(await store.listMemoryRules()).toHaveLength(0);
        // The run itself is untouched.
        expect(await store.loadReview(reviewId)).not.toBeNull();
      });

      it("round-trips a cluster and replaces its membership on save", async () => {
        const id = await store.saveRepoCluster({
          name: "Mobile",
          memberRepoIds: ["acme/api", "acme/ios"],
        });
        expect((await store.listRepoClusters())[0].memberRepoIds).toEqual([
          "acme/api",
          "acme/ios",
        ]);

        await store.saveRepoCluster({ id, name: "Mobile", memberRepoIds: ["acme/ios"] });
        const clusters = await store.listRepoClusters();
        expect(clusters).toHaveLength(1);
        expect(clusters[0].memberRepoIds).toEqual(["acme/ios"]);
      });

      it("deletes a cluster and its membership", async () => {
        const id = await store.saveRepoCluster({
          name: "Mobile",
          memberRepoIds: ["acme/api"],
        });
        await store.deleteRepoCluster(id);
        expect(await store.listRepoClusters()).toHaveLength(0);
      });
    });

    /* ── Review settings ──────────────────────────────────────────────── */

    describe("review settings", () => {
      it("starts from the defaults, not from an empty object", async () => {
        const settings = await store.loadSettings();
        // "high" rather than a middle position: it is the strictness that maps
        // to komodo.yaml's default min_severity, so a deployment that never
        // opens the screen reviews exactly as it did before the screen existed.
        expect(settings.strictness).toBe("high");
        expect(settings.reviewDraftPrs).toBe(false);
        expect(settings.authorFilterTokens).toContain("dependabot[bot]");
        expect(settings.summarySections.summary.enabled).toBe(true);
      });

      it("does not start a review nobody asked for", async () => {
        // A first pass imports whatever inventory exists — a repository with a
        // hundred open pull requests would otherwise spend a subscription on a
        // backlog on the strength of installing Komodo. Both flags off means
        // the queue's Review with AI button is the only thing that starts one.
        const settings = await store.loadSettings();
        expect(settings.autoReviewNewPullRequests).toBe(false);
        expect(settings.autoReviewNewCommits).toBe(false);
      });

      it("applies a patch without disturbing the fields it does not name", async () => {
        await store.saveSettings({ strictness: "high" });
        await store.saveSettings({ fileChangeLimit: 40 });

        const settings = await store.loadSettings();
        expect(settings.strictness).toBe("high");
        expect(settings.fileChangeLimit).toBe(40);
        // Never written, so still the default rather than undefined.
        expect(settings.reviewDraftPrs).toBe(false);
      });

      it("merges summarySections instead of replacing the whole record", async () => {
        await store.saveSettings({
          summarySections: {
            diagram: { enabled: false, collapsible: true, defaultOpen: false },
          } as never,
        });

        const settings = await store.loadSettings();
        expect(settings.summarySections.diagram.enabled).toBe(false);
        // The sections the patch said nothing about survive.
        expect(settings.summarySections.summary.enabled).toBe(true);
        expect(settings.summarySections.walkthrough.enabled).toBe(true);
      });

      it("keeps arrays whole — a patch replaces the token list, never appends", async () => {
        await store.saveSettings({ authorFilterTokens: ["renovate[bot]"] });
        expect((await store.loadSettings()).authorFilterTokens).toEqual([
          "renovate[bot]",
        ]);
      });

      it("puts the settings on the snapshot the app renders from", async () => {
        await store.saveSettings({ orgDisplayName: "Acme" });
        const snapshot = await store.snapshot();
        expect(snapshot.settings.orgDisplayName).toBe("Acme");
      });
    });

    /* ── Deployment facts ─────────────────────────────────────────────── */

    describe("deployment facts", () => {
      it("reports null for a key never written", async () => {
        expect(await store.getMeta("lastPollAt")).toBeNull();
      });

      it("round-trips a value", async () => {
        await store.setMeta("lastPollAt", String(T0));
        expect(await store.getMeta("lastPollAt")).toBe(String(T0));
      });

      it("overwrites rather than accumulating — the poller writes every pass", async () => {
        await store.setMeta("lastPollAt", String(T0));
        await store.setMeta("lastPollAt", String(T0 + 60_000));
        expect(await store.getMeta("lastPollAt")).toBe(String(T0 + 60_000));
      });

      it("keeps keys apart", async () => {
        await store.setMeta("lastPollAt", String(T0));
        await store.setMeta("lastPollError", "token expired");
        expect(await store.getMeta("lastPollAt")).toBe(String(T0));
        expect(await store.getMeta("lastPollError")).toBe("token expired");
      });

      it("stores the empty string as a value, not as an absence", async () => {
        // The loop clears the error key by writing "" rather than deleting it,
        // so "" and null have to stay distinguishable.
        await store.setMeta("lastPollError", "");
        expect(await store.getMeta("lastPollError")).toBe("");
      });
    });
  });
}
