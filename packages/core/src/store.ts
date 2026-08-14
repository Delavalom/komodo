import type { Bucket, Judgement } from "./schema.js";

/**
 * The schema types the UI needs, re-exported so browser code has one
 * client-safe entry point.
 *
 * `export type` is erased at compile time, so this costs no runtime import of
 * schema.js — which matters, because the package barrel reaches the review
 * engine and its Node-only dependencies. Client components must import from
 * `@komodo/core/store`, never `@komodo/core`.
 */
export type {
  Bucket,
  Judgement,
  JudgementKind,
  JudgementOption,
  Severity,
  ReviewResult,
  WalkthroughEntry,
} from "./schema.js";

/** Lifecycle of one judgement as the reviewer works through it. */
export type JudgementStatus = "open" | "awaiting_reply" | "withdrawn" | "closed";

/** Who wrote a message in a judgement thread. */
export type ThreadRole = "reviewer" | "author" | "komodo";

/**
 * A judgement plus what the reviewer decided about it — everything the judge,
 * thread and close screens render.
 *
 * Deliberately a plain structural type and not a database row. The cloud app
 * materializes it from Postgres; the CLI reads it out of
 * `.komodo/reviews/<id>.json`. Neither storage shape reaches shared components,
 * which is what lets those components live in one package.
 *
 * Timestamps are ISO strings rather than Date so the same value survives both
 * transports unchanged (JSON over HTTP for the CLI, the RSC boundary for web).
 */
export interface JudgementView extends Judgement {
  id: string;
  reviewId: string;
  /** Position within the review — drives "3 / 6" and the progress pips. */
  ordinal: number;
  /** Null until answered. */
  bucket: Bucket | null;
  optionLabel: string | null;
  /** The question the reviewer composed, when they chose "Asked". */
  note: string | null;
  blocking: boolean;
  status: JudgementStatus;
  /** The inline PR comment carrying the reviewer's question, once posted. */
  githubCommentId: number | null;
}

/** The pull request a judgement belongs to, as the shared screens need it. */
export interface ReviewView {
  id: string;
  owner: string;
  repo: string;
  number: number;
  title: string;
  postedAt: string | null;
  postedUrl: string | null;
}

export interface ThreadMessage {
  id: string;
  role: ThreadRole;
  authorLogin: string | null;
  body: string;
  /** Set for messages mirrored from a GitHub comment; dedupes on sync. */
  githubCommentId?: number | null;
  createdAt: string;
}

/** One row of the queue: a judgement waiting on the reviewer. */
export interface QueueEntry {
  judgement: JudgementView;
  review: ReviewView;
  /** True when the author has replied and the reviewer has not looked yet. */
  hasReply: boolean;
}

export interface ReviewJudgements {
  review: ReviewView;
  judgements: JudgementView[];
}

export interface JudgementThread {
  judgement: JudgementView;
  review: ReviewView;
  messages: ThreadMessage[];
}

/** Posting a question to the author can fail without losing what was typed. */
export interface AskResult {
  delivered: boolean;
  error?: string;
}

export interface PostResult {
  url?: string;
  error?: string;
}

/**
 * Reads. Runs wherever data lives — a server component in the cloud app, the
 * CLI's local HTTP server for the open-source viewer.
 */
export interface ReviewReader {
  loadQueue(): Promise<QueueEntry[]>;
  loadReviewJudgements(reviewId: string): Promise<ReviewJudgements | null>;
  loadThread(judgementId: string): Promise<JudgementThread | null>;
}

/**
 * Writes. Split from the reads because the two run in different places: the
 * cloud app loads in a server component but mutates from the client through
 * server actions, so only this half is ever handed to a client component.
 */
export interface ReviewActions {
  answer(judgementId: string, optionIndex: number): Promise<void>;
  undoAnswer(judgementId: string): Promise<void>;
  ask(judgementId: string, note: string, blocking: boolean): Promise<AskResult>;
  closeThread(judgementId: string): Promise<void>;
  postReview(reviewId: string): Promise<PostResult>;
}

export interface ReviewStore extends ReviewReader, ReviewActions {}

/** Roughly how long one judgement takes to answer, for the queue's estimate. */
const SECONDS_PER_JUDGEMENT = 45;

/** "about 8 minutes" — the queue's honest estimate of what it will cost you. */
export function estimateTime(count: number): string {
  const minutes = Math.round((count * SECONDS_PER_JUDGEMENT) / 60);
  if (minutes < 1) return "under a minute";
  if (minutes === 1) return "about a minute";
  return `about ${minutes} minutes`;
}

const BUCKET_ORDER: Bucket[] = ["Blocks", "Agreed", "Asked", "Passed on"];

const BUCKET_HEADING: Record<Bucket, string> = {
  Blocks: "Blocking",
  Agreed: "Agreed",
  Asked: "Questions for you",
  "Passed on": "Passed on",
};

/**
 * The review body as the reviewer actually gave it: their answers, grouped by
 * bucket, in the order they gave them. Not Komodo's summary.
 *
 * Shared so a review posted from the CLI reads identically to one posted from
 * the cloud app.
 */
export function renderVerdict(judgements: JudgementView[], blocking: boolean): string {
  const parts: string[] = [
    blocking
      ? "Reviewed with 🦎 Komodo. Some of this blocks merge."
      : "Reviewed with 🦎 Komodo. Nothing here blocks merge.",
  ];

  for (const bucket of BUCKET_ORDER) {
    const inBucket = judgements.filter((j) => j.bucket === bucket);
    if (!inBucket.length) continue;

    const lines = inBucket.map((j) => {
      const title = j.title.replace(/\.$/, "");
      return j.note ? `- ${title} — _${j.note}_` : `- ${title} — ${j.optionLabel}`;
    });
    parts.push(`### ${BUCKET_HEADING[bucket]}\n\n${lines.join("\n")}`);
  }

  return parts.join("\n\n");
}

/** True when any answer should turn the posted review into REQUEST_CHANGES. */
export function isBlocking(judgements: JudgementView[]): boolean {
  return judgements.some((j) => j.bucket === "Blocks" || (j.bucket === "Asked" && j.blocking));
}
