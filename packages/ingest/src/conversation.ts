/**
 * A pull request's conversation, assembled from three GitHub endpoints.
 *
 * The point of bringing this into Komodo is that a reviewer answering
 * judgements should not have to open GitHub in another tab to find out whether
 * the author already explained the thing they are about to ask about. Half of
 * review is reading what has already been said.
 *
 * Three endpoints, because GitHub keeps a pull request's discussion in three
 * places and numbers each independently: comments on the pull request itself,
 * comments anchored to a line of the diff, and the body somebody typed when
 * they submitted a review. A reader wants one thread; this is where the three
 * become it.
 *
 * The mapping lives here rather than in the web app for the same reason
 * `map.ts` does: it is the one place @komodo/core's GitHub vocabulary meets the
 * store's, and if either changes this file stops compiling — which is the
 * intended alarm.
 */
import type { GitHubClient, PRRef } from "@komodo/core";
import type { PullRequestComment } from "@komodo/store";

/** A comment as the store takes it: no id and no prId, both derived there. */
export type ConversationEntry = Omit<PullRequestComment, "id" | "prId">;

/**
 * Everything said on one pull request, oldest first.
 *
 * A review with an empty body is dropped rather than shown: GitHub creates one
 * for every inline comment submitted as part of a review, and rendering them
 * would put an empty bubble above each thread. The review's *state* still
 * arrives — `listReviewDecisions` is what the queue's human-review column reads
 * — so nothing is lost by not drawing it twice.
 */
export async function fetchConversation(
  github: GitHubClient,
  ref: PRRef,
): Promise<ConversationEntry[]> {
  const [issueComments, reviewComments, reviews] = await Promise.all([
    github.listIssueComments(ref),
    github.listReviewComments(ref),
    github.listReviews(ref),
  ]);

  const entries: ConversationEntry[] = [
    ...issueComments.map((c) => ({
      kind: "issue" as const,
      externalId: c.id,
      inReplyToId: null,
      author: c.author,
      body: c.body,
      path: null,
      line: null,
      state: null,
      url: c.html_url,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
    ...reviewComments.map((c) => ({
      kind: "review" as const,
      externalId: c.id,
      inReplyToId: c.in_reply_to_id ?? null,
      author: c.user?.login ?? "unknown",
      body: c.body,
      path: c.path,
      line: c.line,
      state: null,
      url: c.html_url,
      createdAt: Date.parse(c.created_at),
      updatedAt: Date.parse(c.created_at),
    })),
    ...reviews
      .filter((r) => r.body.trim() && r.submittedAt !== null)
      .map((r) => ({
        kind: "review_summary" as const,
        externalId: r.id,
        inReplyToId: null,
        author: r.author,
        body: r.body,
        path: null,
        line: null,
        state: r.state,
        url: r.html_url,
        createdAt: r.submittedAt!,
        updatedAt: r.submittedAt!,
      })),
  ];

  // Oldest first, with the external id as the tiebreak: two comments can carry
  // the same second, and a conversation that reorders itself between reads is
  // one nobody can follow.
  return entries.sort(
    (a, b) => a.createdAt - b.createdAt || a.externalId - b.externalId,
  );
}
