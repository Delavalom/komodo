import type { ReviewRecord, ReviewSummary } from "./types";
import { SAMPLE_REVIEW, SAMPLE_REVIEWS } from "./sample";

export async function fetchReviews(): Promise<ReviewSummary[]> {
  try {
    const res = await fetch("/api/reviews");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as ReviewSummary[];
  } catch {
    // Dev fallback: return sample data when CLI is not running
    return SAMPLE_REVIEWS;
  }
}

export async function fetchReview(id: string): Promise<ReviewRecord> {
  try {
    const res = await fetch(`/api/reviews/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as ReviewRecord;
  } catch {
    // Dev fallback: return sample review for the known sample id
    if (id === SAMPLE_REVIEW.id) return SAMPLE_REVIEW;
    throw new Error(`Review "${id}" not found and no CLI running`);
  }
}
