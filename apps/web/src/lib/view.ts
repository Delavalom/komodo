import type { JudgementView, ReviewView, ThreadMessage } from "@komodo/core";
import type { JudgementMessage, JudgementRow, Review } from "@/db";

/**
 * Drizzle rows → the shared view types in @komodo/core.
 *
 * This is the only place the database shape is allowed to meet the shared
 * components. Everything past here is storage-agnostic, which is what lets the
 * judge/thread/close screens live in packages/ui and be driven by the CLI's
 * file-backed store just as well as by Postgres.
 */
export function toJudgementView(row: JudgementRow): JudgementView {
  return {
    id: row.id,
    reviewId: row.reviewId,
    ordinal: row.ordinal,

    // ---- what Komodo said ----
    path: row.path,
    line: row.line,
    endLine: row.endLine ?? undefined,
    severity: row.severity as JudgementView["severity"],
    kind: row.kind,
    tag: row.tag,
    title: row.title,
    lede: row.lede,
    detail: row.detail,
    ask: row.ask,
    sources: row.sources,
    sourceNote: row.sourceNote,
    code: row.code,
    options: row.options,
    suggestion: row.suggestion ?? undefined,
    fixPrompt: row.fixPrompt,

    // ---- what the reviewer decided ----
    bucket: row.bucket,
    optionLabel: row.optionLabel,
    note: row.note,
    blocking: row.blocking,
    status: row.status,
    githubCommentId: row.githubCommentId,
  };
}

export function toReviewView(review: Review): ReviewView {
  return {
    id: review.id,
    owner: review.owner,
    repo: review.repo,
    number: review.number,
    title: review.title,
    postedAt: review.postedAt?.toISOString() ?? null,
    postedUrl: review.postedUrl,
  };
}

export function toThreadMessage(message: JudgementMessage): ThreadMessage {
  return {
    id: message.id,
    role: message.role,
    authorLogin: message.authorLogin,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
  };
}
