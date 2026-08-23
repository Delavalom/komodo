/**
 * The web app's view of the model.
 *
 * Every entity Komodo persists is defined once in @komodo/store and re-exported
 * here, so the app and the ingester can never drift apart on what a judgment
 * is. Only shapes that never reach a database — query params, derived
 * analytics, and the settings surfaces still held in local state — are
 * declared below.
 *
 * These are types, erased at compile time, so importing them into a client
 * component pulls in nothing from the store package at runtime.
 */
export type {
  Answer,
  ApiKey,
  Bucket,
  Finding,
  FindingStatus,
  ImpactLevel,
  Integration,
  IntegrationProvider,
  IntegrationStatus,
  JudgementKind,
  JudgementOption,
  JudgementVote,
  MemoryFile,
  MemoryKind,
  MemoryRule,
  MemoryRuleStats,
  MemoryStatus,
  JudgementSeverity,
  Judgment,
  Member,
  MemberRole,
  Organization,
  OrgSettings,
  PullRequest,
  PullRequestState,
  RepoCluster,
  Repository,
  Review,
  ReviewDetail,
  ReviewFile,
  ReviewJudgement,
  ReviewStatus,
  Severity,
  SummarySectionConfig,
  SummarySectionKey,
  Team,
  Verdict,
  WalkthroughEntry,
} from "@komodo/store";

/* Re-exporting does not bind the names locally, and the query shapes below
   need them. */
import type {
  Finding,
  SummarySectionKey,
  MemoryKind,
  MemoryStatus,
  ImpactLevel,
  Judgment,
  ReviewStatus,
  SummarySectionConfig,
  Verdict,
} from "@komodo/store";





export interface UsageDay {
  date: number;
  codeReviewCredits: number;
  cliCredits: number;
  reviews: number;
}

/**
 * A personal review preference names the same blocks the org settings do —
 * there is one renderer, and it knows four modules.
 */
export type PersonalSectionKey = SummarySectionKey;

/** What one person has chosen, in their own browser. */
export interface PersonalPreferences {
  showAiFixPrompts: boolean;
  reviewSections: Record<PersonalSectionKey, SummarySectionConfig>;
}

/**
 * Preferences plus who the reader is.
 *
 * Identity is not a preference and is not stored per browser: it comes from
 * the roster komodo.yaml defines, joined in at read time. A hardcoded name
 * here meant every deployment showed the same person in its header.
 */
export interface PersonalSettings extends PersonalPreferences {
  name: string;
  email: string;
  githubLogin: string;
}

/* ── Query shapes ───────────────────────────────────────────────────────── */

/**
 * One row of the team's review queue: the judgment, plus the things a reviewer
 * decides on at a glance. Everything past `repoFullName` is derived at read
 * time — none of it is stored, so it cannot go stale against the row it
 * describes.
 */
export interface QueueRow extends Judgment {
  repoFullName: string;
  /** additions + deletions, and the bucket it falls in. */
  changedLines: number;
  sizeLabel: "XS" | "S" | "M" | "L" | "XL";
  /** How long this has been sitting since anything last happened to it. */
  waitingDays: number;
  /** Open, not a draft, and my review was asked for and not yet given. */
  needsMyReview: boolean;
  /** Komodo says blocked, or a human already requested changes. */
  isBlocked: boolean;
  isStale: boolean;
  /** The worst few findings, P0 first — the pre-triage the queue exists for. */
  topFindings: Finding[];
}

export type QueueLens = "all" | "mine" | "blocked" | "stale";

export interface QueueQuery {
  lens?: QueueLens;
  search?: string;
  author?: string;
  repo?: string;
}

export interface JudgmentQuery {
  search?: string;
  author?: string;
  repo?: string;
  subgroup?: string;
  status?: ReviewStatus;
  confidence?: string;
  impact?: ImpactLevel;
  verdict?: Verdict;
  sort?: "asc" | "desc";
}

export interface MemoryQuery {
  search?: string;
  repository?: string;
  type?: MemoryKind;
  status?: MemoryStatus;
  usage?: string;
  acceptance?: string;
  sortBy?: "usage" | "acceptance" | "status";
  sortDir?: "asc" | "desc";
  page?: number;
  perPage?: number;
}

export type Timeframe =
  | "all"
  | "this-week"
  | "this-month"
  | "this-quarter"
  | "this-year"
  | "custom";

export type Granularity = "day" | "week" | "month";

export interface AnalyticsQuery {
  teams?: string[];
  repos?: string[];
  authors?: string[];
  timeframe?: Timeframe;
  granularity?: Granularity;
}

export interface SeriesPoint {
  date: number;
  value: number;
}

export interface AnalyticsSummary {
  totalPrs: number;
  totalReviews: number;
  avgMergeTimeDays: number;
  bugsCaught: number;
}

export interface FindingsSummary {
  all: number;
  security: number;
  p0: number;
  p1: number;
  p2: number;
}

export interface LeaderRow {
  label: string;
  value: string;
  kind: "repo" | "user";
}
