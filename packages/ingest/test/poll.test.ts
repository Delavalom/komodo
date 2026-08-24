import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_ORG_SETTINGS } from "@komodo/store";
import { SqliteStore } from "@komodo/store/sqlite";
import type { GitHubClient } from "@komodo/core";

import { pollRepositories } from "../src/poll.js";

const T0 = 1_700_000_000_000;

/** Counts what the poller asks for, so the cheap-listing promise is testable. */
function fakeGitHub(
  listing: Record<string, unknown[]>,
  /** How the pull requests that left the listing actually ended. */
  ended: { state: "merged" | "closed"; mergedAt: number | null } = {
    state: "closed",
    mergedAt: null,
  },
) {
  const calls = { list: 0, size: 0, reviews: 0, state: 0 };
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
  } as unknown as GitHubClient;
  return { client, calls };
}

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
    await pollRepositories(first.client, store, {
      settings: DEFAULT_ORG_SETTINGS,
    });

    expect(await store.listPullRequests()).toHaveLength(2);
    expect(await store.listAIReviewJobs()).toEqual([]);
  });

  it("queues a pull request first observed after the repository baseline", async () => {
    const first = fakeGitHub({ "acme/api": [listed()] });
    await pollRepositories(first.client, store, {
      settings: DEFAULT_ORG_SETTINGS,
    });

    const second = fakeGitHub({
      "acme/api": [listed(), listed({ number: 2, headSha: "bbb222" })],
    });
    await pollRepositories(second.client, store, {
      settings: DEFAULT_ORG_SETTINGS,
    });

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
