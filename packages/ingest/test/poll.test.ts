import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_ORG_SETTINGS } from "@komodo/store";
import { SqliteStore } from "@komodo/store/sqlite";
import { KomodoConfigSchema, type GitHubClient } from "@komodo/core";

import { pollRepositories } from "../src/poll.js";

const T0 = 1_700_000_000_000;

/**
 * A team that has asked for automatic review, which is not the default.
 *
 * Enqueueing needs the settings to want it *and* a config to filter with, so
 * every test about jobs has to say both — which is the point: a caller that
 * supplies neither imports inventory and starts nothing.
 */
const AUTOMATIC = {
  ...DEFAULT_ORG_SETTINGS,
  autoReviewNewPullRequests: true,
  autoReviewNewCommits: true,
};

const config = (over: Record<string, unknown> = {}) =>
  KomodoConfigSchema.parse(over);

/** Settings and config together, so a test can say "automatic review is on". */
const automatic = (over: Record<string, unknown> = {}) => ({
  settings: AUTOMATIC,
  config: config(over),
});

/** Counts what the poller asks for, so the cheap-listing promise is testable. */
function fakeGitHub(
  listing: Record<string, unknown[]>,
  /** How the pull requests that left the listing actually ended. */
  ended: { state: "merged" | "closed"; mergedAt: number | null } = {
    state: "closed",
    mergedAt: null,
  },
  /** Check rollups per repository, or an Error the query should throw. */
  rollups: Record<string, any[] | Error> = {},
) {
  const calls = { list: 0, size: 0, reviews: 0, state: 0, checks: 0, details: 0 };
  const client = {
    async getPRState() {
      calls.state++;
      return ended;
    },
    async listOpenPRs(owner: string, repo: string) {
      calls.list++;
      return listing[`${owner}/${repo}`] ?? [];
    },
    async getPRSize() {
      calls.size++;
      return { additions: 10, deletions: 2, changedFiles: 3 };
    },
    async listReviewDecisions() {
      calls.reviews++;
      return { approvals: ["kai"], changesRequested: [] };
    },
    async checkRollups(owner: string, repo: string) {
      calls.checks++;
      const forRepo = rollups[`${owner}/${repo}`];
      if (forRepo instanceof Error) throw forRepo;
      return new Map((forRepo ?? []).map((r) => [r.number, r]));
    },
    async failingChecks() {
      calls.details++;
      return {
        state: "failing",
        total: 4,
        passed: 2,
        failed: 2,
        pending: 0,
        failing: ["build", "lint"],
      };
    },
  } as unknown as GitHubClient;
  return { client, calls };
}

const rollup = (over: Record<string, unknown> = {}) => ({
  number: 1,
  headSha: "aaa111",
  state: "passing" as const,
  failing: [] as string[],
  ...over,
});

function listed(over: Record<string, unknown> = {}) {
  return {
    number: 1,
    title: "Add rate limiting",
    author: "renata",
    url: "https://github.com/acme/api/pull/1",
    headSha: "aaa111",
    isDraft: false,
    requestedReviewers: ["dev"],
    createdAt: T0,
    updatedAt: T0,
    ...over,
  };
}

describe("pollRepositories", () => {
  let store: SqliteStore;

  beforeEach(async () => {
    store = new SqliteStore({ path: ":memory:" });
    await store.upsertRepository({
      id: "acme/api", owner: "acme", name: "api",
      provider: "github", enabled: true, reviewCount: 0,
    });
  });

  it("writes listed pull requests in as git facts", async () => {
    const { client } = fakeGitHub({ "acme/api": [listed()] });
    const result = await pollRepositories(client, store);

    expect(result).toMatchObject({ seen: 1, changed: 1, closed: 0 });
    const [pr] = await store.listPullRequests();
    expect(pr.id).toBe("acme/api#1");
    expect(pr.approvals).toEqual(["kai"]);
    expect(pr.changedFiles).toBe(3);
    expect(pr.state).toBe("open");
  });

  it("pays for detail only when a pull request is new or its head moved", async () => {
    const { client, calls } = fakeGitHub({ "acme/api": [listed()] });

    await pollRepositories(client, store);
    expect(calls.size).toBe(1);

    // Nothing moved: the second pass costs one listing and nothing else.
    await pollRepositories(client, store);
    expect(calls.list).toBe(2);
    expect(calls.size).toBe(1);
    expect(calls.reviews).toBe(1);
  });

  it("refreshes same-head queue facts when GitHub reports new activity", async () => {
    const first = fakeGitHub({ "acme/api": [listed()] });
    await pollRepositories(first.client, store);

    const second = fakeGitHub({
      "acme/api": [
        listed({
          title: "Ready for review",
          isDraft: false,
          requestedReviewers: ["dev", "sam"],
          updatedAt: T0 + 1,
        }),
      ],
    });
    await pollRepositories(second.client, store);

    expect(second.calls.size).toBe(0);
    expect(second.calls.reviews).toBe(1);
    const [row] = await store.listPullRequests();
    expect(row.title).toBe("Ready for review");
    expect(row.requestedReviewers).toEqual(["dev", "sam"]);
  });

  it("imports the first repository inventory without creating an AI backlog", async () => {
    const first = fakeGitHub({
      "acme/api": [listed(), listed({ number: 2, headSha: "bbb222" })],
    });
    await pollRepositories(first.client, store, automatic());

    expect(await store.listPullRequests()).toHaveLength(2);
    expect(await store.listAIReviewJobs()).toEqual([]);
  });

  it("starts nothing on the shipped settings, however new the pull request", async () => {
    // The whole first-run complaint: a store whose baseline was written by an
    // earlier pass, 172 open pull requests, and a subscription spent on a
    // backlog nobody asked to be reviewed.
    const first = fakeGitHub({ "acme/api": [listed()] });
    await pollRepositories(first.client, store, {
      settings: DEFAULT_ORG_SETTINGS,
      config: config(),
    });

    const second = fakeGitHub({
      "acme/api": [listed(), listed({ number: 2, headSha: "bbb222" })],
    });
    await pollRepositories(second.client, store, {
      settings: DEFAULT_ORG_SETTINGS,
      config: config(),
    });

    expect(await store.listPullRequests()).toHaveLength(2);
    expect(await store.listAIReviewJobs()).toEqual([]);
  });

  it("imports what it will not review, and counts it once", async () => {
    // A draft and an off-roster author are inventory: the row belongs in the
    // queue with its Review with AI button. What they must not cost is a job,
    // a lease, a skipped judgment and a line of output per pass, forever.
    const first = fakeGitHub({ "acme/api": [listed()] });
    await pollRepositories(first.client, store, automatic());

    const second = fakeGitHub({
      "acme/api": [
        listed(),
        listed({ number: 2, headSha: "bbb222", isDraft: true }),
        listed({ number: 3, headSha: "ccc333", author: "outsider" }),
      ],
    });
    const result = await pollRepositories(
      second.client,
      store,
      automatic({ auto_review: { authors: { mode: "include", tokens: ["renata"] } } }),
    );

    expect(await store.listPullRequests()).toHaveLength(3);
    expect(await store.listAIReviewJobs()).toEqual([]);
    expect(result.notEligible).toBe(2);
  });

  it("still refuses a review larger than the file cap", async () => {
    const first = fakeGitHub({ "acme/api": [listed()] });
    await pollRepositories(first.client, store, automatic());

    const second = fakeGitHub({
      "acme/api": [listed(), listed({ number: 2, headSha: "bbb222" })],
    });
    const result = await pollRepositories(
      second.client,
      store,
      // The fake reports three changed files for every pull request.
      automatic({ auto_review: { max_files: 2 } }),
    );

    expect(await store.listAIReviewJobs()).toEqual([]);
    expect(result.notEligible).toBe(1);
  });

  it("imports inventory and starts nothing when no config was supplied", async () => {
    const first = fakeGitHub({ "acme/api": [listed()] });
    await pollRepositories(first.client, store, { settings: AUTOMATIC });

    const second = fakeGitHub({
      "acme/api": [listed(), listed({ number: 2, headSha: "bbb222" })],
    });
    const result = await pollRepositories(second.client, store, {
      settings: AUTOMATIC,
    });

    expect(await store.listPullRequests()).toHaveLength(2);
    expect(await store.listAIReviewJobs()).toEqual([]);
    expect(result.notEligible).toBe(1);
  });

  it("queues a pull request first observed after the repository baseline", async () => {
    const first = fakeGitHub({ "acme/api": [listed()] });
    await pollRepositories(first.client, store, automatic());

    const second = fakeGitHub({
      "acme/api": [listed(), listed({ number: 2, headSha: "bbb222" })],
    });
    await pollRepositories(second.client, store, automatic());

    expect(await store.listAIReviewJobs()).toEqual([
      expect.objectContaining({
        id: "acme/api#2@bbb222",
        trigger: "new_pull_request",
        state: "queued",
      }),
    ]);
  });

  it("re-fetches and re-queues a pull request after a new push", async () => {
    const first = fakeGitHub({ "acme/api": [listed()] });
    await pollRepositories(first.client, store);
    await store.upsertJudgment({
      prId: "acme/api#1", headSha: "aaa111", verdict: "ship",
      status: "completed", impact: "low", score: 5,
    });
    expect(await store.listPullRequestsNeedingReview()).toHaveLength(0);

    const second = fakeGitHub({ "acme/api": [listed({ headSha: "bbb222" })] });
    await pollRepositories(second.client, store);

    expect(second.calls.size).toBe(1);
    expect(await store.listPullRequestsNeedingReview()).toHaveLength(1);
  });

  it("closes a pull request that stops appearing in the listing", async () => {
    const open = fakeGitHub({ "acme/api": [listed()] });
    await pollRepositories(open.client, store);

    const gone = fakeGitHub({ "acme/api": [] });
    const result = await pollRepositories(gone.client, store);

    expect(result.closed).toBe(1);
    const [pr] = await store.listPullRequests();
    expect(pr.state).toBe("closed");
    expect(pr.mergedAt).toBeNull();
    expect(await store.listPullRequestsNeedingReview()).toHaveLength(0);
  });

  it("asks how a vanished pull request ended rather than assuming closed", async () => {
    // The whole merge half of the analytics depends on this: without the
    // question, mergedAt is never written by anything but the seeder.
    const open = fakeGitHub({ "acme/api": [listed()] });
    await pollRepositories(open.client, store);

    const merged = fakeGitHub({ "acme/api": [] }, {
      state: "merged",
      mergedAt: T0 + 86_400_000,
    });
    await pollRepositories(merged.client, store);

    expect(merged.calls.state).toBe(1);
    const [pr] = await store.listPullRequests();
    expect(pr.state).toBe("merged");
    expect(pr.mergedAt).toBe(T0 + 86_400_000);
  });

  it("asks only once — a settled pull request never re-enters that branch", async () => {
    const open = fakeGitHub({ "acme/api": [listed()] });
    await pollRepositories(open.client, store);

    const gone = fakeGitHub({ "acme/api": [] }, { state: "merged", mergedAt: T0 });
    await pollRepositories(gone.client, store);
    await pollRepositories(gone.client, store);

    expect(gone.calls.state).toBe(1);
  });

  it("falls back to closed when the final state cannot be read", async () => {
    const open = fakeGitHub({ "acme/api": [listed()] });
    await pollRepositories(open.client, store);

    const broken = fakeGitHub({ "acme/api": [] });
    (broken.client as unknown as { getPRState: () => Promise<never> }).getPRState =
      () => Promise.reject(new Error("404 Not Found"));

    const result = await pollRepositories(broken.client, store);

    // The pass survives and the row stops showing as open work, which is the
    // property that matters — the badge is the thing we lose.
    expect(result.closed).toBe(1);
    const [pr] = await store.listPullRequests();
    expect(pr.state).toBe("closed");
  });

  it("skips a repository that has been disabled", async () => {
    await store.setRepoEnabled("acme/api", false);
    const { client, calls } = fakeGitHub({ "acme/api": [listed()] });

    const result = await pollRepositories(client, store);
    expect(calls.list).toBe(0);
    expect(result.seen).toBe(0);
  });

  it("polls every enabled repository, whatever a team happens to watch", async () => {
    // Discovery writes repositories no team watches yet. `enabled` is the one
    // switch, so a row switched on is polled — otherwise Manage Repositories
    // would be toggling something the poller ignores.
    await store.upsertRepository({
      id: "acme/www", owner: "acme", name: "www",
      provider: "github", enabled: true, reviewCount: 0,
    });
    await store.saveTeam({
      name: "Core", memberIds: [], watchedRepoIds: ["acme/api"],
    });

    const { client, calls } = fakeGitHub({
      "acme/api": [listed()],
      "acme/www": [listed({ number: 9 })],
    });
    const result = await pollRepositories(client, store);

    expect(calls.list).toBe(2);
    expect(result.seen).toBe(2);
  });

  it("leaves a discovered but disabled repository alone", async () => {
    await store.upsertRepository({
      id: "acme/www", owner: "acme", name: "www",
      provider: "github", enabled: false, reviewCount: 0,
    });

    const { client, calls } = fakeGitHub({
      "acme/api": [listed()],
      "acme/www": [listed({ number: 9 })],
    });
    const result = await pollRepositories(client, store);

    expect(calls.list).toBe(1);
    expect(result.seen).toBe(1);
  });

  it("keeps polling the rest when one repository cannot be listed", async () => {
    // A repository the token has lost — renamed, gone private, a scope
    // dropped — used to throw out of the pass and stall every other one.
    await store.upsertRepository({
      id: "acme/gone", owner: "acme", name: "gone",
      provider: "github", enabled: true, reviewCount: 0,
    });
    const { client } = fakeGitHub({ "acme/api": [listed()] });
    const failing = {
      ...client,
      listOpenPRs: async (owner: string, repo: string) => {
        if (repo === "gone") throw new Error("GitHub GET /repos/acme/gone/pulls → 404");
        return client.listOpenPRs(owner, repo);
      },
    } as unknown as GitHubClient;

    const result = await pollRepositories(failing, store);

    expect(result.unreachable).toBe(1);
    expect(result.seen).toBe(1);
  });

  /* ── Check rollups ──────────────────────────────────────────────────── */

  it("records the rollup for a pull request's current head", async () => {
    const { client, calls } = fakeGitHub({ "acme/api": [listed()] }, undefined, {
      "acme/api": [rollup()],
    });
    const result = await pollRepositories(client, store);

    expect(result.checksObserved).toBe(1);
    const [pr] = await store.listPullRequests();
    expect(pr.checks?.state).toBe("passing");
    // One query for the whole repository, not one per pull request — and no
    // detail query at all, because nothing is failing.
    expect(calls.checks).toBe(1);
    expect(calls.details).toBe(0);
  });

  it("does not invent counts for a rollup whose detail it never fetched", async () => {
    const { client } = fakeGitHub({ "acme/api": [listed()] }, undefined, {
      "acme/api": [rollup()],
    });
    await pollRepositories(client, store);

    const [pr] = await store.listPullRequests();
    // The cheap query returns a state and nothing else. "0 checks passed" for
    // a commit nobody counted would be a number made up on the way past.
    expect(pr.checks?.total).toBeNull();
    expect(pr.checks?.passed).toBeNull();
  });

  it("buys the failing check names, and only for a failing commit", async () => {
    const { client, calls } = fakeGitHub({ "acme/api": [listed()] }, undefined, {
      "acme/api": [rollup({ state: "failing" })],
    });
    await pollRepositories(client, store);

    expect(calls.details).toBe(1);
    const [pr] = await store.listPullRequests();
    expect(pr.checks?.failing).toEqual(["build", "lint"]);
    expect(pr.checks?.total).toBe(4);
  });

  it("reads checks on a pass where nothing else changed", async () => {
    // GitHub does not move a pull request's updatedAt when a check finishes,
    // so the activity gate that spares the size and review-decision calls
    // cannot be applied here. A red build must be able to turn green without
    // anybody pushing.
    const first = fakeGitHub({ "acme/api": [listed()] }, undefined, {
      "acme/api": [rollup({ state: "pending" })],
    });
    await pollRepositories(first.client, store, { checksIntervalMs: 0 });
    expect((await store.listPullRequests())[0].checks?.state).toBe("pending");

    const second = fakeGitHub({ "acme/api": [listed()] }, undefined, {
      "acme/api": [rollup()],
    });
    const result = await pollRepositories(second.client, store, { checksIntervalMs: 0 });

    expect(result.checksObserved).toBe(1);
    expect(second.calls.size).toBe(0);
    expect(second.calls.reviews).toBe(0);
    expect((await store.listPullRequests())[0].checks?.state).toBe("passing");
  });

  it("does not re-read a repository's checks on every pass", async () => {
    // The listing is a conditional REST request a 304 makes free. The rollup
    // query is GraphQL, scored in points against a fixed hourly allowance —
    // one repository on a one-minute poll would have spent the lot.
    const first = fakeGitHub({ "acme/api": [listed()] }, undefined, {
      "acme/api": [rollup()],
    });
    await pollRepositories(first.client, store);

    const second = fakeGitHub({ "acme/api": [listed()] }, undefined, {
      "acme/api": [rollup()],
    });
    const result = await pollRepositories(second.client, store);

    expect(second.calls.checks).toBe(0);
    expect(second.calls.list).toBe(1);
    expect(result.checksObserved).toBe(0);
  });

  it("asks again on the next pass when the check query failed", async () => {
    // The interval is stamped on success only, so an unreadable repository is
    // retried rather than marked done for five minutes.
    const first = fakeGitHub({ "acme/api": [listed()] }, undefined, {
      "acme/api": new Error("GitHub GraphQL: API rate limit exceeded"),
    });
    await pollRepositories(first.client, store);

    const second = fakeGitHub({ "acme/api": [listed()] }, undefined, {
      "acme/api": [rollup()],
    });
    await pollRepositories(second.client, store);

    expect(second.calls.checks).toBe(1);
    expect((await store.listPullRequests())[0].checks?.state).toBe("passing");
  });

  it("spends nothing on a repository with no open pull requests", async () => {
    const { client, calls } = fakeGitHub({ "acme/api": [] });
    await pollRepositories(client, store);
    expect(calls.checks).toBe(0);
  });

  it("will not write a rollup read from a commit the head has moved past", async () => {
    // The listing and the rollup query are two requests, and a push can land
    // between them. Writing the older commit's answer would put a green build
    // against code nobody has built.
    const { client } = fakeGitHub({ "acme/api": [listed({ headSha: "bbb222" })] }, undefined, {
      "acme/api": [rollup({ headSha: "aaa111" })],
    });
    const result = await pollRepositories(client, store);

    expect(result.checksObserved).toBe(0);
    expect((await store.listPullRequests())[0].checks).toBeNull();
  });

  it("keeps polling when the check query fails", async () => {
    const { client } = fakeGitHub({ "acme/api": [listed()] }, undefined, {
      "acme/api": new Error("GitHub GraphQL: API rate limit exceeded"),
    });
    const result = await pollRepositories(client, store);

    // The inventory is the job; the column is not worth losing a pass over.
    expect(result.seen).toBe(1);
    expect(result.checksObserved).toBe(0);
    expect((await store.listPullRequests())[0].state).toBe("open");
  });

  it("leaves the last rollup alone when a later pass cannot read one", async () => {
    const first = fakeGitHub({ "acme/api": [listed()] }, undefined, {
      "acme/api": [rollup()],
    });
    await pollRepositories(first.client, store);

    const second = fakeGitHub({ "acme/api": [listed()] }, undefined, {
      "acme/api": new Error("GitHub GraphQL: Resource not accessible"),
    });
    await pollRepositories(second.client, store, { checksIntervalMs: 0 });

    // Still shown, because the head has not moved and the observation is
    // minutes old — readChecks stops showing it once it is a day old.
    expect((await store.listPullRequests())[0].checks?.state).toBe("passing");
  });

  it("leaves an unreachable repository's pull requests open, not closed", async () => {
    const first = fakeGitHub({ "acme/api": [listed()] });
    await pollRepositories(first.client, store);

    const broken = {
      async listOpenPRs() {
        throw new Error("GitHub GET /repos/acme/api/pulls → 403");
      },
      async getPRState() {
        throw new Error("should not be asked");
      },
    } as unknown as GitHubClient;
    const result = await pollRepositories(broken, store);

    expect(result.closed).toBe(0);
    const pr = (await store.listPullRequests())[0];
    expect(pr.state).toBe("open");
  });
});
