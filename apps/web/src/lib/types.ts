/**
 * Domain model — docs/SPEC.md §4.
 * convex/schema.ts mirrors this file field for field. Change both together.
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

export type MemoryKind = "rule" | "file";

export type MemoryStatus = "active" | "inactive";

export type MemberRole = "admin" | "member";

export type IntegrationProvider = "atlassian" | "linear" | "devin";

export type IntegrationStatus = "connected" | "not_configured" | "error";

export interface Organization {
  slug: string;
  name: string;
  role: MemberRole;
  trialEndsAt: number;
  plan: "trial" | "pro" | "enterprise";
}

export interface Repository {
  id: string;
  owner: string;
  name: string;
  provider: "github" | "gitlab";
  enabled: boolean;
  reviewCount: number;
}

export interface PullRequest {
  id: string;
  repoId: string;
  number: number;
  title: string;
  author: string;
  url: string;
  createdAt: number;
  updatedAt: number;
  mergedAt: number | null;
  reviewCount: number;
  impact: ImpactLevel;
  status: ReviewStatus;
  score: number;
  addressedComments: number;
  totalComments: number;
  upvotes: number;
  downvotes: number;
}

export interface Finding {
  id: string;
  prId: string;
  title: string;
  body: string;
  severity: Severity;
  isSecurity: boolean;
  status: FindingStatus;
  filePath: string;
  createdAt: number;
}

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

export interface Member {
  id: string;
  email: string;
  name: string;
  role: MemberRole;
  avatarSeed: string;
  isYou: boolean;
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

export interface PullRequestQuery {
  search?: string;
  author?: string;
  repo?: string;
  subgroup?: string;
  status?: ReviewStatus;
  confidence?: string;
  impact?: ImpactLevel;
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
