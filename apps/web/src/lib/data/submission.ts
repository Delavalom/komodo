import "server-only";

/**
 * Writing a review that was produced somewhere else.
 *
 * The headless pipeline writes its results through the ingester. An
 * interactive agent — a Claude session on someone's laptop, reviewing a PR it
 * checked out itself — has no way into that path: it is a different process on
 * a different machine, and until now its only option was to open the store's
 * SQLite file directly, which a real deployment does not have.
 *
 * So the record arrives over HTTP and lands here. Deliberately the same three
 * writes, through the same mapping functions the ingester uses: a review
 * submitted by an agent and one produced by `komodo serve` have to be the same
 * row, or the queue is showing two kinds of thing under one name.
 */
import type { ReviewRecord } from "@komodo/core";
import { toFindings, toJudgment, toReview } from "@komodo/ingest";
import type { KomodoStore } from "@komodo/store";

export interface StoredSubmission {
  reviewId: string;
  judgmentId: string;
}

export async function storeSubmittedReview(
  store: KomodoStore,
  prId: string,
  record: ReviewRecord,
): Promise<StoredSubmission> {
  const judgmentId = await store.upsertJudgment(
    toJudgment(prId, record.pr.headSha, record.result),
  );
  const reviewId = await store.saveReview(toReview(prId, record));
  // Replaces rather than appends, so re-submitting the same head cannot
  // double a pull request's findings.
  await store.replaceFindings(judgmentId, toFindings(record.result, reviewId));
  return { reviewId, judgmentId };
}

/**
 * Where the review can be read, for the agent to hand to the person waiting.
 *
 * The route spells the pull request out in path segments rather than encoding
 * an id, and `/-/pr/...` resolves the organization slug for itself — the same
 * slug-less shape a posted receipt links at, because a submission and a
 * receipt are pointing at the same screen.
 */
export function submittedReviewUrl(
  host: string,
  prId: string,
  headSha: string,
): string {
  const [repoFullName, number] = prId.split("#");
  return `${host}/-/pr/${repoFullName}/${number}?run=${headSha}`;
}
