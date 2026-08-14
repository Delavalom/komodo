import "server-only";
import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { getDb, judgementMessages, judgements, reviews } from "@/db";
import type { JudgementRow, Review } from "@/db";

/** Roughly how long one judgement takes to answer, for the queue's time estimate. */
const SECONDS_PER_JUDGEMENT = 45;

export interface QueueEntry {
  judgement: JudgementRow;
  review: Review;
  /** True when the author has replied and the reviewer has not looked yet. */
  hasReply: boolean;
}

/**
 * Everything waiting on this reviewer, across every pull request: judgements
 * they have not answered, plus threads the author has replied to.
 */
export async function loadQueue(userId: string): Promise<QueueEntry[]> {
  const db = getDb();

  const rows = await db
    .select({ judgement: judgements, review: reviews })
    .from(judgements)
    .innerJoin(reviews, eq(reviews.id, judgements.reviewId))
    .where(
      and(
        eq(judgements.userId, userId),
        ne(judgements.status, "withdrawn"),
        ne(judgements.status, "closed"),
      ),
    )
    .orderBy(desc(reviews.createdAt), asc(judgements.ordinal));

  const waiting = rows.filter(
    (r) => r.judgement.bucket === null || r.judgement.status === "awaiting_reply",
  );

  // Which of the open threads the author has actually replied to — one query
  // for all of them, not one per thread.
  const threadIds = waiting
    .filter((r) => r.judgement.status === "awaiting_reply")
    .map((r) => r.judgement.id);

  const replied = new Set<string>();
  if (threadIds.length) {
    const authored = await db
      .select({ judgementId: judgementMessages.judgementId })
      .from(judgementMessages)
      .where(
        and(
          inArray(judgementMessages.judgementId, threadIds),
          eq(judgementMessages.role, "author"),
        ),
      );
    for (const m of authored) replied.add(m.judgementId);
  }

  return waiting.map((r) => ({ ...r, hasReply: replied.has(r.judgement.id) }));
}

/** "about 8 minutes" — the queue's honest estimate of what it will cost you. */
export function estimateTime(count: number): string {
  const minutes = Math.round((count * SECONDS_PER_JUDGEMENT) / 60);
  if (minutes < 1) return "under a minute";
  if (minutes === 1) return "about a minute";
  return `about ${minutes} minutes`;
}

/** Every judgement in one review, in the order Komodo raised them. */
export async function loadReviewJudgements(
  reviewId: string,
  userId: string,
): Promise<{ review: Review; rows: JudgementRow[] } | null> {
  const db = getDb();
  const [review] = await db
    .select()
    .from(reviews)
    .where(and(eq(reviews.id, reviewId), eq(reviews.userId, userId)))
    .limit(1);
  if (!review) return null;

  const rows = await db
    .select()
    .from(judgements)
    .where(eq(judgements.reviewId, reviewId))
    .orderBy(asc(judgements.ordinal));

  return { review, rows };
}

/** One judgement, its review, and the whole reply thread. */
export async function loadThread(judgementId: string, userId: string) {
  const db = getDb();
  const [row] = await db
    .select({ judgement: judgements, review: reviews })
    .from(judgements)
    .innerJoin(reviews, eq(reviews.id, judgements.reviewId))
    .where(and(eq(judgements.id, judgementId), eq(judgements.userId, userId)))
    .limit(1);
  if (!row) return null;

  const messages = await db
    .select()
    .from(judgementMessages)
    .where(eq(judgementMessages.judgementId, judgementId))
    .orderBy(asc(judgementMessages.createdAt));

  return { ...row, messages };
}

export async function countUnanswered(userId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ id: judgements.id })
    .from(judgements)
    .where(
      and(
        eq(judgements.userId, userId),
        isNull(judgements.bucket),
        ne(judgements.status, "withdrawn"),
      ),
    );
  return rows.length;
}
