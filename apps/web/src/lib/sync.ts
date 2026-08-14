import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { GitHubClient, OpenRouterProvider, type Judgement, type PRRef } from "@komodo/core";
import { getDb, judgementMessages, judgements, reviews } from "@/db";
import type { JudgementRow, Review } from "@/db";
import { calculateCreditsCharged, deductCredits } from "@/lib/credits";

/**
 * Pull author replies from GitHub and, where the author answered, have Komodo
 * re-read the file at the current head to see whether its judgement survives.
 *
 * Plain functions rather than server actions: these run during a page render,
 * where `revalidatePath` is not allowed. The caller reads the database after
 * syncing, so there is nothing to revalidate anyway.
 */

function refOf(review: Review): PRRef {
  return { owner: review.owner, repo: review.repo, number: review.number };
}

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

/** Sync every open thread on one review. One GitHub round-trip for the lot. */
async function syncReview(
  review: Review,
  rows: JudgementRow[],
  accessToken: string,
): Promise<void> {
  const db = getDb();
  const github = new GitHubClient(accessToken);

  const withComments = rows.filter((r) => r.githubCommentId !== null);
  if (!withComments.length) return;

  let comments;
  try {
    comments = await github.listReviewComments(refOf(review));
  } catch {
    return; // GitHub unreachable — try again next time someone looks.
  }

  const known = new Set(
    (
      await db
        .select({ githubCommentId: judgementMessages.githubCommentId })
        .from(judgementMessages)
        .where(
          inArray(
            judgementMessages.judgementId,
            withComments.map((r) => r.id),
          ),
        )
    )
      .map((m) => m.githubCommentId)
      .filter((id): id is number => id !== null),
  );

  for (const row of withComments) {
    const fresh = comments.filter(
      (c) => c.in_reply_to_id === row.githubCommentId && !known.has(c.id),
    );
    if (!fresh.length) continue;

    await db.insert(judgementMessages).values(
      fresh.map((c) => ({
        judgementId: row.id,
        role: "author" as const,
        authorLogin: c.user?.login ?? null,
        body: c.body,
        githubCommentId: c.id,
      })),
    );

    await reread(review, row, fresh.map((c) => c.body).join("\n\n"), github);
  }
}

/** Ask the model whether the judgement still holds against the current head. */
async function reread(
  review: Review,
  row: JudgementRow,
  reply: string,
  github: GitHubClient,
): Promise<void> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || !review.model) return;

  const db = getDb();
  try {
    // Re-fetch the head: the author may have pushed since the review ran.
    const pr = await github.getPR(refOf(review));
    const files = await github.listFiles(refOf(review));
    const file = files.find((f) => f.path === row.path);

    const provider = new OpenRouterProvider(apiKey, review.model);
    const verdict = await provider.reread({
      judgement: toJudgement(row),
      question: row.note ?? "",
      reply,
      patch: file?.patch,
      headSha: pr.headSha,
    });

    await db
      .insert(judgementMessages)
      .values({ judgementId: row.id, role: "komodo", body: verdict.note });

    if (!verdict.stillApplies) {
      await db
        .update(judgements)
        .set({ status: "withdrawn", blocking: false })
        .where(eq(judgements.id, row.id));
    }

    await deductCredits(
      review.userId,
      calculateCreditsCharged(provider.lastUsage?.cost ?? 0),
      `reread:${row.id}`,
      provider.lastUsage?.generationId ?? null,
    );
  } catch {
    // The reply is already saved; the judgement simply stays as it was.
  }
}

/** Sync one judgement's thread — used when the reviewer opens it. */
export async function syncJudgementThread(
  judgementId: string,
  userId: string,
  accessToken: string,
): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ judgement: judgements, review: reviews })
    .from(judgements)
    .innerJoin(reviews, eq(reviews.id, judgements.reviewId))
    .where(and(eq(judgements.id, judgementId), eq(judgements.userId, userId)))
    .limit(1);

  if (!row || row.judgement.status !== "awaiting_reply") return;
  await syncReview(row.review, [row.judgement], accessToken);
}

/**
 * Sync every open thread this reviewer has, grouped so each pull request costs
 * one GitHub call rather than one per judgement.
 */
export async function syncOpenThreads(userId: string, accessToken: string): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ judgement: judgements, review: reviews })
    .from(judgements)
    .innerJoin(reviews, eq(reviews.id, judgements.reviewId))
    .where(and(eq(judgements.userId, userId), eq(judgements.status, "awaiting_reply")));
  if (!rows.length) return;

  const byReview = new Map<string, { review: Review; rows: JudgementRow[] }>();
  for (const r of rows) {
    const entry = byReview.get(r.review.id) ?? { review: r.review, rows: [] };
    entry.rows.push(r.judgement);
    byReview.set(r.review.id, entry);
  }

  await Promise.all(
    [...byReview.values()].map((e) => syncReview(e.review, e.rows, accessToken)),
  );
}
