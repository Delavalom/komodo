import "server-only";
import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import type { JudgementThread, QueueEntry, ReviewJudgements } from "@komodo/core";
import { getDb, judgementMessages, judgements, reviews } from "@/db";
import { toJudgementView, toReviewView, toThreadMessage } from "./view";

/**
 * The read half of the ReviewStore port, backed by Postgres.
 *
 * Every function here returns the shared view types from @komodo/core rather
 * than Drizzle rows, so the screens consuming them can live in packages/ui and
 * work identically against the CLI's file-backed store.
 */

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

  return waiting.map((r) => ({
    judgement: toJudgementView(r.judgement),
    review: toReviewView(r.review),
    hasReply: replied.has(r.judgement.id),
  }));
}

/** Every judgement in one review, in the order Komodo raised them. */
export async function loadReviewJudgements(
  reviewId: string,
  userId: string,
): Promise<ReviewJudgements | null> {
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

  return { review: toReviewView(review), judgements: rows.map(toJudgementView) };
}

/** One judgement, its review, and the whole reply thread. */
export async function loadThread(
  judgementId: string,
  userId: string,
): Promise<JudgementThread | null> {
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

  return {
    judgement: toJudgementView(row.judgement),
    review: toReviewView(row.review),
    messages: messages.map(toThreadMessage),
  };
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
