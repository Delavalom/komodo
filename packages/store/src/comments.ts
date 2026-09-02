/**
 * Preparing a fetched conversation for storage.
 *
 * A comment's id is derived from the pull request, the endpoint it came from
 * and GitHub's own id, so two comments in one batch can only collide if the
 * caller handed the same comment in twice. The drivers used to answer that
 * with `ON CONFLICT DO UPDATE`, which merged the two rows field by field: body
 * and timestamp from the second, author and URL from the first. The result was
 * a comment attributing one person's text to another person's name — a wrong
 * row that no error ever mentioned.
 *
 * Last one wins instead, whole. It is the same rule the rest of this cache
 * follows: GitHub is the truth, and the most recent reading of it replaces
 * what came before rather than being blended into it.
 */
import { commentId } from "./ids.js";
import type { PullRequestComment } from "./types.js";

export function dedupeComments(
  prId: string,
  comments: Omit<PullRequestComment, "id" | "prId">[],
): (Omit<PullRequestComment, "prId"> & { id: string })[] {
  const byId = new Map<string, Omit<PullRequestComment, "prId"> & { id: string }>();
  for (const comment of comments) {
    const id = commentId(prId, comment.kind, comment.externalId);
    byId.set(id, { ...comment, id });
  }
  return [...byId.values()];
}
