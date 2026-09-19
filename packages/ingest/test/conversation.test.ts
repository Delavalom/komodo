/**
 * Three GitHub endpoints, one reading order.
 */
import { describe, expect, it } from "vitest";

import type { GitHubClient } from "@komodo/core";

import { fetchConversation } from "../src/conversation.js";

const T0 = 1_700_000_000_000;
const iso = (offset: number) => new Date(T0 + offset).toISOString();

function fakeGitHub(over: Record<string, unknown[]> = {}) {
  return {
    async listIssueComments() {
      return (
        over.issue ?? [
          {
            id: 10,
            author: "renata",
            body: "Does this handle the empty case?",
            html_url: "https://github.com/acme/api/pull/1#issuecomment-10",
            createdAt: T0 + 2000,
            updatedAt: T0 + 2000,
          },
        ]
      );
    },
    async listReviewComments() {
      return (
        over.review ?? [
          {
            id: 20,
            path: "auth/session.ts",
            line: 88,
            body: "Why not revoke the cache entry too?",
            html_url: "https://github.com/acme/api/pull/1#discussion_r20",
            created_at: iso(1000),
            user: { login: "kai" },
          },
          {
            id: 21,
            in_reply_to_id: 20,
            path: "auth/session.ts",
            line: 88,
            body: "Because the TTL is fifteen minutes.",
            html_url: "https://github.com/acme/api/pull/1#discussion_r21",
            created_at: iso(3000),
            user: { login: "marco" },
          },
        ]
      );
    },
    async listReviews() {
      return (
        over.reviews ?? [
          {
            id: 30,
            author: "kai",
            state: "CHANGES_REQUESTED",
            body: "One question on the session path.",
            html_url: "https://github.com/acme/api/pull/1#pullrequestreview-30",
            submittedAt: T0 + 4000,
          },
        ]
      );
    },
  } as unknown as GitHubClient;
}

const ref = { owner: "acme", repo: "api", number: 1 };

describe("a pull request's conversation", () => {
  it("merges the three endpoints into one chronological thread", async () => {
    const entries = await fetchConversation(fakeGitHub(), ref);

    expect(entries.map((e) => e.externalId)).toEqual([20, 10, 21, 30]);
    expect(entries.map((e) => e.kind)).toEqual([
      "review",
      "issue",
      "review",
      "review_summary",
    ]);
  });

  it("keeps an inline comment's anchor and an issue comment's absence of one", async () => {
    const entries = await fetchConversation(fakeGitHub(), ref);
    const inline = entries.find((e) => e.externalId === 20)!;
    const issue = entries.find((e) => e.externalId === 10)!;

    expect(inline).toMatchObject({ path: "auth/session.ts", line: 88 });
    expect(issue.path).toBeNull();
    expect(issue.line).toBeNull();
  });

  it("keeps a reply pointing at what it answers", async () => {
    const entries = await fetchConversation(fakeGitHub(), ref);
    expect(entries.find((e) => e.externalId === 21)?.inReplyToId).toBe(20);
    expect(entries.find((e) => e.externalId === 20)?.inReplyToId).toBeNull();
  });

  it("carries a review's state, which is the thing a reader needs from it", async () => {
    const entries = await fetchConversation(fakeGitHub(), ref);
    expect(entries.find((e) => e.kind === "review_summary")?.state).toBe(
      "CHANGES_REQUESTED",
    );
  });

  it("drops the empty review GitHub creates for every inline comment", async () => {
    // Submitting one inline comment as a review produces a review with no body.
    // Drawing it would put an empty bubble above every thread.
    const entries = await fetchConversation(
      fakeGitHub({
        reviews: [
          { id: 31, author: "kai", state: "COMMENTED", body: "", html_url: "u", submittedAt: T0 },
          { id: 32, author: "kai", state: "COMMENTED", body: "   ", html_url: "u", submittedAt: T0 },
        ],
      }),
      ref,
    );
    expect(entries.filter((e) => e.kind === "review_summary")).toEqual([]);
  });

  it("drops a review that has not been submitted", async () => {
    // A pending review is one person's private draft, and it is visible to the
    // token that owns it. Showing it to the team would be publishing it.
    const entries = await fetchConversation(
      fakeGitHub({
        reviews: [
          { id: 33, author: "kai", state: "PENDING", body: "not sent yet", html_url: "u", submittedAt: null },
        ],
      }),
      ref,
    );
    expect(entries.filter((e) => e.kind === "review_summary")).toEqual([]);
  });

  it("names an author GitHub could not, rather than leaving it blank", async () => {
    const entries = await fetchConversation(
      fakeGitHub({
        issue: [],
        reviews: [],
        review: [
          {
            id: 40,
            path: "a.ts",
            line: 1,
            body: "from a deleted account",
            html_url: "u",
            created_at: iso(0),
            user: null,
          },
        ],
      }),
      ref,
    );
    expect(entries[0].author).toBe("unknown");
  });

  it("orders two comments in the same millisecond deterministically", async () => {
    const entries = await fetchConversation(
      fakeGitHub({
        issue: [
          { id: 9, author: "a", body: "second", html_url: "u", createdAt: T0, updatedAt: T0 },
          { id: 8, author: "b", body: "first", html_url: "u", createdAt: T0, updatedAt: T0 },
        ],
        review: [],
        reviews: [],
      }),
      ref,
    );
    // A conversation that reorders itself between two reads is one nobody can
    // follow, so the external id is the tiebreak.
    expect(entries.map((e) => e.externalId)).toEqual([8, 9]);
  });

  it("returns nothing for a pull request nobody has commented on", async () => {
    const entries = await fetchConversation(
      fakeGitHub({ issue: [], review: [], reviews: [] }),
      ref,
    );
    expect(entries).toEqual([]);
  });
});
