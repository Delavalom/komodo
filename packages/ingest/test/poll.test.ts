import { beforeEach, describe, expect, it } from "vitest";

import { SqliteStore } from "@komodo/store/sqlite";
import type { GitHubClient } from "@komodo/core";

import { pollRepositories } from "../src/poll.js";

const T0 = 1_700_000_000_000;

/** Counts what the poller asks for, so the cheap-listing promise is testable. */
function fakeGitHub(listing: Record<string, unknown[]>) {
  const calls = { list: 0, size: 0, reviews: 0 };
  const client = {
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
    expect(await store.listPullRequestsNeedingReview()).toHaveLength(0);
  });

  it("skips a repository that has been disabled", async () => {
    await store.setRepoEnabled("acme/api", false);
    const { client, calls } = fakeGitHub({ "acme/api": [listed()] });

    const result = await pollRepositories(client, store);
    expect(calls.list).toBe(0);
    expect(result.seen).toBe(0);
  });

  it("polls only what a team watches, once any team watches anything", async () => {
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

    expect(calls.list).toBe(1);
    expect(result.seen).toBe(1);
  });
});
