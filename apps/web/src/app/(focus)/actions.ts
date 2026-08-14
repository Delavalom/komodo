"use server";

import { and, asc, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  GitHubClient,
  renderJudgementComment,
  type Bucket,
  type Judgement,
  type PRRef,
} from "@komodo/core";
import { auth } from "@/auth";
import { getDb, judgementMessages, judgements, reviews } from "@/db";
import type { JudgementRow, Review } from "@/db";

/** Everything an action needs, after proving the caller owns the judgement. */
async function loadOwnedJudgement(judgementId: string) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not signed in.");

  const db = getDb();
  const [row] = await db
    .select({ judgement: judgements, review: reviews })
    .from(judgements)
    .innerJoin(reviews, eq(reviews.id, judgements.reviewId))
    .where(and(eq(judgements.id, judgementId), eq(judgements.userId, userId)))
    .limit(1);

  if (!row) throw new Error("Judgement not found.");
  return { db, userId, accessToken: session!.accessToken, ...row };
}

function refOf(review: Review): PRRef {
  return { owner: review.owner, repo: review.repo, number: review.number };
}

/** The judgement as the model produced it, for prompts and comment rendering. */
function toJudgement(j: JudgementRow): Judgement {
  return {
    path: j.path,
    line: j.line,
    endLine: j.endLine ?? undefined,
    severity: j.severity as Judgement["severity"],
    kind: j.kind,
    tag: j.tag,
    title: j.title,
    lede: j.lede,
    detail: j.detail,
    ask: j.ask,
    sources: j.sources,
    sourceNote: j.sourceNote,
    code: j.code,
    options: j.options,
    suggestion: j.suggestion ?? undefined,
    fixPrompt: j.fixPrompt,
  };
}

/** Record a plain answer (anything but "I have a question first"). */
export async function answerJudgement(judgementId: string, optionIndex: number): Promise<void> {
  const { db, judgement, review } = await loadOwnedJudgement(judgementId);

  const option = judgement.options[optionIndex];
  if (!option) throw new Error("No such option.");
  if (option.bucket === "Asked") {
    throw new Error("Use askQuestion for the 'Asked' option — it needs a written question.");
  }

  await db
    .update(judgements)
    .set({ bucket: option.bucket, optionLabel: option.label, answeredAt: new Date() })
    .where(eq(judgements.id, judgementId));

  revalidatePath(`/reviews/${review.id}/judge`);
  revalidatePath("/queue");
}

/** Take back an answer so the judgement can be decided again. */
export async function undoAnswer(judgementId: string): Promise<void> {
  const { db, judgement, review } = await loadOwnedJudgement(judgementId);

  // A question already sent to the author cannot be silently un-asked.
  if (judgement.status === "awaiting_reply") {
    throw new Error("That question is already with the author. Close the thread instead.");
  }

  await db
    .update(judgements)
    .set({ bucket: null, optionLabel: null, note: null, blocking: false, answeredAt: null })
    .where(eq(judgements.id, judgementId));

  revalidatePath(`/reviews/${review.id}/judge`);
  revalidatePath("/queue");
}

/**
 * Send the reviewer's question to the author as an inline PR comment.
 *
 * The row is written first and the GitHub call second: if GitHub rejects it the
 * question is still recorded with `githubCommentId: null`, which the thread
 * screen surfaces as "not delivered" rather than losing what was typed.
 */
export async function askQuestion(
  judgementId: string,
  draft: string,
  blocking: boolean,
): Promise<{ delivered: boolean; error?: string }> {
  const { db, judgement, review, accessToken } = await loadOwnedJudgement(judgementId);

  const question = draft.trim();
  if (!question) throw new Error("Write the question first.");

  await db
    .update(judgements)
    .set({
      bucket: "Asked" satisfies Bucket,
      optionLabel: blocking
        ? "Question sent — merge blocked until it is answered"
        : "Question sent — not blocking",
      note: question,
      blocking,
      status: "awaiting_reply",
      answeredAt: new Date(),
    })
    .where(eq(judgements.id, judgementId));

  const [message] = await db
    .insert(judgementMessages)
    .values({ judgementId, role: "reviewer", body: question })
    .returning({ id: judgementMessages.id });

  let delivered = false;
  let error: string | undefined;
  try {
    const github = new GitHubClient(accessToken);
    // Re-fetch the head: the author may have pushed since the review ran, and
    // GitHub rejects comments anchored to a stale commit.
    const pr = await github.getPR(refOf(review));
    const body =
      `${renderJudgementComment(toJudgement(judgement))}\n\n---\n\n` +
      `**A question from the reviewer:**\n\n${question}` +
      (blocking ? "\n\n<sub>Merge is blocked until this is answered.</sub>" : "");

    const comment = await github.createReviewComment(
      refOf(review),
      pr.headSha,
      judgement.path,
      judgement.endLine ?? judgement.line,
      body,
    );
    await db
      .update(judgements)
      .set({ githubCommentId: comment.id })
      .where(eq(judgements.id, judgementId));
    await db
      .update(judgementMessages)
      .set({ githubCommentId: comment.id })
      .where(eq(judgementMessages.id, message.id));
    delivered = true;
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not post the question to GitHub.";
  }

  revalidatePath(`/reviews/${review.id}/judge`);
  revalidatePath("/queue");
  return { delivered, error };
}

/** Accept the outcome of a thread and take it off the queue. */
export async function closeThread(judgementId: string): Promise<void> {
  const { db } = await loadOwnedJudgement(judgementId);
  await db.update(judgements).set({ status: "closed" }).where(eq(judgements.id, judgementId));
  revalidatePath("/queue");
}

/**
 * Post the review the reviewer actually gave: their answers, grouped, in the
 * order they gave them. Refuses to run twice.
 */
export async function postReview(
  reviewId: string,
): Promise<{ url?: string; error?: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not signed in.");

  const db = getDb();
  const [review] = await db
    .select()
    .from(reviews)
    .where(and(eq(reviews.id, reviewId), eq(reviews.userId, userId)))
    .limit(1);
  if (!review) throw new Error("Review not found.");
  if (review.postedAt) return { error: "This review has already been posted." };

  const rows = await db
    .select()
    .from(judgements)
    .where(and(eq(judgements.reviewId, reviewId), ne(judgements.status, "withdrawn")))
    .orderBy(asc(judgements.ordinal));

  const unanswered = rows.filter((r) => r.bucket === null);
  if (unanswered.length) {
    return { error: `${unanswered.length} judgement(s) still unanswered.` };
  }

  const blocking = rows.some((r) => r.bucket === "Blocks" || (r.bucket === "Asked" && r.blocking));
  const event = blocking ? ("REQUEST_CHANGES" as const) : ("APPROVE" as const);

  const github = new GitHubClient(session!.accessToken);
  try {
    const pr = await github.getPR(refOf(review));
    const result = await github.postReview(
      refOf(review),
      pr.headSha,
      renderVerdict(rows, blocking),
      event,
      [],
    );

    await db
      .update(reviews)
      .set({ postedAt: new Date(), postedUrl: result.html_url, postedEvent: event })
      .where(eq(reviews.id, reviewId));

    revalidatePath(`/reviews/${reviewId}/close`);
    revalidatePath("/queue");
    return { url: result.html_url };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not post the review." };
  }
}

const BUCKET_ORDER: Bucket[] = ["Blocks", "Agreed", "Asked", "Passed on"];

const BUCKET_HEADING: Record<Bucket, string> = {
  Blocks: "Blocking",
  Agreed: "Agreed",
  Asked: "Questions for you",
  "Passed on": "Passed on",
};

/** The reviewer's words, grouped by bucket — not Komodo's summary. */
function renderVerdict(rows: JudgementRow[], blocking: boolean): string {
  const parts: string[] = [
    blocking
      ? "Reviewed with 🦎 Komodo. Some of this blocks merge."
      : "Reviewed with 🦎 Komodo. Nothing here blocks merge.",
  ];

  for (const bucket of BUCKET_ORDER) {
    const inBucket = rows.filter((r) => r.bucket === bucket);
    if (!inBucket.length) continue;

    const lines = inBucket.map((r) => {
      const title = r.title.replace(/\.$/, "");
      return r.note ? `- ${title} — _${r.note}_` : `- ${title} — ${r.optionLabel}`;
    });
    parts.push(`### ${BUCKET_HEADING[bucket]}\n\n${lines.join("\n")}`);
  }

  return parts.join("\n\n");
}
