import { beforeEach, describe, expect, it } from "vitest";

import { SqliteStore } from "@komodo/store/sqlite";
import type { GitHubClient, WatchTriageProvider } from "@komodo/core";

import { pollWatches } from "../src/watch.js";

const T0 = 1_700_000_000_000;

function fakeGitHub(issueComments: unknown[] = []) {
  const calls = { issue: 0, review: 0, reviews: 0 };
  const client = {
    async listIssueComments() {
      calls.issue++;
      return issueComments;
    },
    async listReviewComments() {
      calls.review++;
      return [];
    },
    async listReviews() {
      calls.reviews++;
      return [];
    },
  } as unknown as GitHubClient;
  return { client, calls };
}

function fakeTriage(verdict: "worth_addressing" | "not_worth_addressing" = "worth_addressing") {
  const calls: unknown[] = [];
  const triage: WatchTriageProvider = {
    name: "fake",
    async triage(input) {
      calls.push(input);
      return { verdict, reasoning: "because", draftResponse: null, draftPatchSummary: null };
    },
  };
  return { triage, calls };
}

const comment = (over: Record<string, unknown> = {}) => ({
  id: 1,
  author: "renata",
  body: "Does this handle the empty case?",
  html_url: "https://github.com/acme/api/pull/1#issuecomment-1",
  createdAt: T0,
  updatedAt: T0,
  ...over,
});

describe("pollWatches", () => {
  let store: SqliteStore;
  let memberId: string;

  beforeEach(async () => {
    store = new SqliteStore({ path: ":memory:" });
    await store.upsertRepository({
      id: "acme/api", owner: "acme", name: "api",
      provider: "github", enabled: true, reviewCount: 0,
    });
    await store.upsertPullRequest({
      id: "acme/api#1", repoId: "acme/api", number: 1,
      title: "Add rate limiting", author: "renata",
      url: "https://github.com/acme/api/pull/1",
      headSha: "aaa111", state: "open", isDraft: false,
      requestedReviewers: [], approvals: [], changesRequested: [],
      additions: 10, deletions: 2, changedFiles: 1,
      createdAt: T0, updatedAt: T0, mergedAt: null,
    });
    memberId = await store.saveMember({
      email: "renata@acme.com", name: "Renata", githubLogin: "renata",
      role: "member", avatarSeed: "renata", isYou: false,
    });
  });

  it("makes no triage call when nothing new has been said", async () => {
    await store.saveWatch({ prId: "acme/api#1", memberId, mode: "notify" });
    const { client } = fakeGitHub([]);
    const { triage, calls } = fakeTriage();

    const result = await pollWatches(client, store, triage);

    expect(result).toEqual({ checked: 1, eventsRecorded: 0 });
    expect(calls).toHaveLength(0);
    expect(await store.listWatchEvents()).toHaveLength(0);
  });

  it("triages exactly one new comment and records exactly one event", async () => {
    await store.saveWatch({ prId: "acme/api#1", memberId, mode: "notify" });
    const { client } = fakeGitHub([comment()]);
    const { triage, calls } = fakeTriage();

    const result = await pollWatches(client, store, triage);

    expect(result).toEqual({ checked: 1, eventsRecorded: 1 });
    expect(calls).toHaveLength(1);
    const [event] = await store.listWatchEvents();
    expect(event.commentAuthor).toBe("renata");
    expect(event.verdict).toBe("worth_addressing");

    // A second pass sees nothing new — the watermark moved.
    const second = await pollWatches(client, store, triage, { intervalMs: 0 });
    expect(second.eventsRecorded).toBe(0);
    expect(calls).toHaveLength(1);
  });

  it("keeps triaging later comments after one fails, and retries the failure next pass", async () => {
    await store.saveWatch({ prId: "acme/api#1", memberId, mode: "notify" });
    const { client } = fakeGitHub([
      comment({ id: 1, author: "cursor[bot]", body: "templated bot noise" }),
      comment({ id: 2, author: "renata", body: "Does this handle the empty case?" }),
    ]);
    const calls: unknown[] = [];
    const triage: WatchTriageProvider = {
      name: "fake",
      async triage(input) {
        calls.push(input);
        if (input.comment.author === "cursor[bot]") throw new Error("error_max_turns");
        return {
          verdict: "worth_addressing",
          reasoning: "because",
          draftResponse: null,
          draftPatchSummary: null,
        };
      },
    };
    const progress: string[] = [];

    const result = await pollWatches(client, store, triage, { onProgress: (m) => progress.push(m) });

    expect(result).toEqual({ checked: 1, eventsRecorded: 1 });
    expect(calls).toHaveLength(2);
    const events = await store.listWatchEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.commentAuthor).toBe("renata");
    expect(progress.some((m) => m.includes("error_max_turns"))).toBe(true);

    // No event was recorded for the failed comment, so it is tried again —
    // a transient failure must not permanently drop the comment.
    const second = await pollWatches(client, store, triage, { intervalMs: 0 });
    expect(second.eventsRecorded).toBe(0);
    expect(calls).toHaveLength(3);
  });

  it("does not starve a later comment whose GitHub id is smaller than an earlier review's", async () => {
    // GitHub hands out review ids and review-comment ids from independent
    // counters, so an older review can carry a bigger raw id than a review
    // comment posted well after it — exactly what happened on the real PR
    // this test is modelled on.
    await store.saveWatch({ prId: "acme/api#1", memberId, mode: "notify" });
    let reviews: unknown[] = [
      { id: 999_999, author: "cursor[bot]", state: "COMMENTED", body: "Bugbot found 1 issue.", html_url: "x", submittedAt: T0 },
    ];
    const client = {
      async listIssueComments() {
        return [];
      },
      async listReviewComments() {
        return [];
      },
      async listReviews() {
        return reviews;
      },
    } as unknown as GitHubClient;
    const { triage, calls } = fakeTriage();

    const first = await pollWatches(client, store, triage);
    expect(first.eventsRecorded).toBe(1);
    expect(calls).toHaveLength(1);

    // A genuinely new review comment arrives later, but with a smaller id
    // than the review already seen.
    reviews = [
      ...reviews,
      { id: 100, author: "renata", state: "COMMENTED", body: "Does this handle the empty case?", html_url: "y", submittedAt: T0 + 60_000 },
    ];

    const second = await pollWatches(client, store, triage, { intervalMs: 0 });
    expect(second.eventsRecorded).toBe(1);
    expect(calls).toHaveLength(2);
    const authors = (await store.listWatchEvents()).map((e) => e.commentAuthor);
    expect(authors).toContain("renata");
  });

  it("skips a watch on a closed pull request rather than deleting it", async () => {
    await store.upsertPullRequest({
      id: "acme/api#1", repoId: "acme/api", number: 1,
      title: "Add rate limiting", author: "renata",
      url: "https://github.com/acme/api/pull/1",
      headSha: "aaa111", state: "closed", isDraft: false,
      requestedReviewers: [], approvals: [], changesRequested: [],
      additions: 10, deletions: 2, changedFiles: 1,
      createdAt: T0, updatedAt: T0, mergedAt: null,
    });
    const watchId = await store.saveWatch({ prId: "acme/api#1", memberId, mode: "notify" });
    const { client } = fakeGitHub([comment()]);
    const { triage, calls } = fakeTriage();

    const result = await pollWatches(client, store, triage);

    expect(result).toEqual({ checked: 0, eventsRecorded: 0 });
    expect(calls).toHaveLength(0);
    expect(await store.listPullRequestWatches()).toHaveLength(1);
    expect((await store.listPullRequestWatches())[0].id).toBe(watchId);
  });

  it("skips a watch on a disabled repository", async () => {
    await store.setRepoEnabled("acme/api", false);
    await store.saveWatch({ prId: "acme/api#1", memberId, mode: "notify" });
    const { client } = fakeGitHub([comment()]);
    const { triage, calls } = fakeTriage();

    const result = await pollWatches(client, store, triage);

    expect(result).toEqual({ checked: 0, eventsRecorded: 0 });
    expect(calls).toHaveLength(0);
  });

  it("does not run again before the interval has passed", async () => {
    await store.saveWatch({ prId: "acme/api#1", memberId, mode: "notify" });
    const { client } = fakeGitHub([comment()]);
    const { triage, calls } = fakeTriage();

    await pollWatches(client, store, triage, { intervalMs: 60_000 });
    expect(calls).toHaveLength(1);

    const again = await pollWatches(client, store, triage, { intervalMs: 60_000 });
    expect(again).toEqual({ checked: 0, eventsRecorded: 0 });
    expect(calls).toHaveLength(1);
  });
});
