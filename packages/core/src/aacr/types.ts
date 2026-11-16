/** One AACR-Bench reference comment (a known issue in the PR). */
export interface AacrReference {
  path: string;
  fromLine?: number;
  toLine?: number;
  side?: "left" | "right";
  note: string;
  category: string;
  context: string;
}

/** One pull request from the benchmark, with every reference on it. */
export interface AacrInstance {
  id: string;
  /** owner/name on GitHub. */
  repo: string;
  prUrl: string;
  language: string;
  baseCommit: string;
  headCommit: string;
  changeLines: number;
  references: AacrReference[];
}

/** One comment a reviewer produced, reduced to what the judge sees. */
export interface GeneratedComment {
  path: string;
  fromLine?: number;
  toLine?: number;
  body: string;
}

/**
 * What a reviewer knows about one of its comments beyond the text: Komodo's
 * judgement focus, kind and severity. The judge never sees it; it exists so a
 * run can be re-scored on a subset (`eval aacr score --only-focus code`).
 */
export interface CommentDetail {
  focus?: string;
  kind?: string;
  severity?: string;
}

export interface ReviewerRun {
  instanceId: string;
  reviewer: string;
  comments: GeneratedComment[];
  /** Same length and order as `comments`, when the reviewer can say. */
  details?: CommentDetail[];
  /** Raised but not shown (filtered, or dropped by an experiment), for diagnosis. Never scored. */
  hidden?: (GeneratedComment & CommentDetail & { reason: string })[];
  durationSeconds: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number | null;
  error?: string;
}

export interface Reviewer {
  name: string;
  review(instance: AacrInstance, repoPath: string, signal?: AbortSignal): Promise<ReviewerRun>;
}
