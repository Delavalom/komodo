/**
 * The entities Komodo persists.
 *
 * This is the one definition shared by the ingester, the CLI and the web app —
 * apps/web/src/lib/types.ts re-exports it and adds the view-only shapes that
 * never reach a database.
 *
 * Timestamps are epoch milliseconds. They survive JSON and the RSC boundary
 * unchanged, and `date-fns` in the UI takes them directly.
 */

export type ImpactLevel = "low" | "medium" | "high" | "critical";

export type ReviewStatus =
  | "completed"
  | "pending"
  | "skipped"
  | "error"
  | "trial_ended"
  | "usage_limit";

export type Severity = "P0" | "P1" | "P2";

export type FindingStatus = "open" | "addressed" | "dismissed";

/**
 * The call Komodo makes on a pull request — the whole point of a judgment.
 * `null` until a review completes.
 */
export type Verdict = "ship" | "ship_with_notes" | "needs_work" | "blocked";

export type MemberRole = "admin" | "member";

/** Where a pull request sits in its own lifecycle. Never Komodo's opinion. */
export type PullRequestState = "open" | "merged" | "closed";

export interface Organization {
  slug: string;
  name: string;
  role: MemberRole;
  trialEndsAt: number;
  plan: "trial" | "pro" | "enterprise";
}

/**
 * Who the queue is for.
 *
 * Membership is a Komodo-local roster rather than a GitHub team, so it works
 * without org admin rights and spans orgs. `watchedRepoIds` is what the
 * ingester polls.
 */
export interface Team {
  id: string;
  name: string;
  memberIds: string[];
  watchedRepoIds: string[];
}

/**
 * `githubLogin` is the join key between the roster and the logins GitHub
 * reports as authors and reviewers. Without it a member cannot be matched to
 * their pull requests, so the queue cannot say whose review it is waiting on.
 */
export interface Member {
  id: string;
  email: string;
  name: string;
  githubLogin: string;
  role: MemberRole;
  avatarSeed: string;
  isYou: boolean;
}

export interface Repository {
  id: string;
  owner: string;
  name: string;
  provider: "github" | "gitlab";
  enabled: boolean;
  reviewCount: number;
}

/**
 * Git facts about the pull request under judgment. Never Komodo's opinion —
 * the poller owns every field here, and a re-review never rewrites them.
 *
 * `headSha` is the idempotency key: a judgment belongs to one (prId, headSha),
 * so a restart resumes without duplicating work and a new push re-reviews.
 */
export interface PullRequest {
  id: string;
  repoId: string;
  number: number;
  title: string;
  author: string;
  url: string;
  headSha: string;
  state: PullRequestState;
  isDraft: boolean;
  requestedReviewers: string[];
  approvals: string[];
  changesRequested: string[];
  additions: number;
  deletions: number;
  changedFiles: number;
  createdAt: number;
  updatedAt: number;
  mergedAt: number | null;
}

/**
 * Komodo's verdict on one pull request — what a human reads instead of the
 * diff. Flat because it is a read-model: everything from `prId` down is joined
 * in from `pullRequests`, not stored on the judgment row.
 */
export interface Judgment {
  id: string;
  verdict: Verdict | null;
  status: ReviewStatus;
  impact: ImpactLevel;
  score: number;
  reviewCount: number;
  addressedComments: number;
  totalComments: number;
  upvotes: number;
  downvotes: number;

  prId: string;
  repoId: string;
  number: number;
  title: string;
  author: string;
  url: string;
  headSha: string;
  state: PullRequestState;
  isDraft: boolean;
  requestedReviewers: string[];
  approvals: string[];
  changesRequested: string[];
  additions: number;
  deletions: number;
  changedFiles: number;
  createdAt: number;
  updatedAt: number;
  mergedAt: number | null;
}

/** One issue raised inside a judgment. */
export interface Finding {
  id: string;
  judgmentId: string;
  title: string;
  body: string;
  severity: Severity;
  isSecurity: boolean;
  status: FindingStatus;
  filePath: string;
  createdAt: number;
}
