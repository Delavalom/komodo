/**
 * Whether a pull request's AI review can be (re)requested.
 *
 * A durable job (`ai_review_jobs`) always wins when one exists — it is the
 * only place "queued" and "running" live, and a judgment written by an
 * earlier head has nothing to say about the current one. Absent a job, the
 * judgment for this exact head stands in: this is the same reduction the
 * queue's "Review with AI" button gates on, and the review page's button
 * needs the identical answer so the two never disagree about whether a
 * request is already in flight.
 */
import type { AIReviewJob, AIReviewJobState, ReviewStatus } from "./types.js";

export type AiState = AIReviewJobState | "not_requested";

export function deriveAiState(
  job: AIReviewJob | null,
  judgmentStatus: ReviewStatus | null,
): AiState {
  if (job) return job.state;
  switch (judgmentStatus) {
    case "completed":
      return "completed";
    case "skipped":
      return "skipped";
    case "pending":
      return "queued";
    case null:
      return "not_requested";
    default:
      return "failed";
  }
}

/** States from which asking for a review (or another one) makes sense. */
export function canRequestAiReview(state: AiState): boolean {
  return state === "not_requested" || state === "failed" || state === "skipped" || state === "cancelled";
}
