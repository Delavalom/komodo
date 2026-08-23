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
  Finding,
  FindingStatus,
  ImpactLevel,
  Judgment,
  Member,
  MemberRole,
  Organization,
  PullRequest,
  PullRequestState,
  Repository,
  ReviewStatus,
  Severity,
  Team,
  Verdict,
} from "@komodo/store";

/* Re-exporting does not bind the names locally, and the query shapes below
   need them. */
import type { Finding, ImpactLevel, Judgment, ReviewStatus, Verdict } from "@komodo/store";

export type MemoryKind = "rule" | "file";

export type MemoryStatus = "active" | "inactive";

export type IntegrationProvider = "atlassian" | "linear" | "devin";

export type IntegrationStatus = "connected" | "not_configured" | "error";

export interface MemoryFile {
  path: string;
  uses: number;
  repoFullName: string;
}

export interface MemoryRule {
  id: string;
  description: string;
  kind: MemoryKind;
  pattern: string;
  files: MemoryFile[];
  repoId: string | null;
  fileGlob: string;
  status: MemoryStatus;
  usageCount: number;
  usesThisMonth: number;
  acceptanceRate: number | null;
  upvotes: number;
  downvotes: number;
  createdAt: number;
  updatedAt: number;
}

export interface RepoCluster {
  id: string;
  name: string;
  memberRepoIds: string[];
  createdAt: number;
}

export interface Integration {
  id: string;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  connectedAt: number | null;
}

export interface ApiKey {
  id: string;
  name: string;
  keyId: string;
  createdAt: number;
}

export interface UsageDay {
  date: number;
  codeReviewCredits: number;
  trexCredits: number;
  cliCredits: number;
  reviews: number;
}

/** The org-wide agent configuration behind /settings/review, /trex, /memory. */
export interface OrgSettings {
  autoReviewNewCommits: boolean;
  reviewDraftPrs: boolean;
  fileChangeLimit: number;
  authorFilterMode: "exclude" | "include";
  authorFilterTokens: string[];
  updatePrDescription: boolean;
  summarySections: Record<SummarySectionKey, SummarySectionConfig>;
  customInstructions: string;
  strictness: "low" | "medium" | "high";
  commentHeader: string;
  promptToFixWithAi: boolean;
  useStatusChecks: boolean;
  requiredConfidence: number;
  postStatusComments: boolean;
  autoApprovePrs: boolean;
  maxAutoApproveRisk: ImpactLevel;
  trexEnabled: boolean;
  memoryRuleCreators: "everyone" | "admins";
  autoEnableNewRepos: boolean;
  helpImproveGreptile: boolean;
  featureTips: boolean;
  orgDisplayName: string;
}

export type SummarySectionKey =
  | "prSummary"
  | "confidenceScore"
  | "issueTable"
  | "sequenceDiagram"
  | "commentsOutsideDiff";

export interface SummarySectionConfig {
  enabled: boolean;
  collapsible: boolean;
  defaultOpen: boolean;
}

export type PersonalSectionKey =
  | "summary"
  | "issuesTable"
  | "diagram"
  | "commentsOutsideDiff";

export interface PersonalSettings {
  name: string;
  email: string;
  showAiFixPrompts: boolean;
  selectedAgents: string[];
  reviewSections: Record<PersonalSectionKey, SummarySectionConfig>;
  trexOnMyPrs: "default" | "off";
  weeklyDigest: boolean;
  githubLinked: boolean;
  cursorCloudAgents: IntegrationStatus;
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
