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
  /**
   * Position within its judgment, worst first.
   *
   * Explicit because every finding in a batch is written with the same
   * timestamp, so ordering on `createdAt` alone has no tiebreak — SQLite
   * happened to return insert order and Postgres did not, which meant the two
   * drivers rendered the same review's findings in different orders and any
   * paginated view over them could drop or repeat a row.
   */
  ordinal: number;
  title: string;
  body: string;
  severity: Severity;
  isSecurity: boolean;
  status: FindingStatus;
  filePath: string;
  createdAt: number;
}

/* ── Deployment settings ─────────────────────────────────────────────────── */

/**
 * One block of the review comment GitHub gets, and how it is folded.
 *
 * Mirrors @komodo/core's `modules` toggles; the translation between the two
 * lives in packages/ingest/src/settings.ts, for the same reason the judgement
 * mapping lives in map.ts — this package has no dependency on core.
 */
export interface SummarySectionConfig {
  enabled: boolean;
  collapsible: boolean;
  defaultOpen: boolean;
}

/**
 * The four blocks Komodo can put in a review comment.
 *
 * Named for what the renderer actually produces — these map one-for-one onto
 * @komodo/core's `modules`. The screen used to offer an "issue table" and
 * "comments outside the diff", neither of which anything rendered.
 */
export type SummarySectionKey =
  | "summary"
  | "confidence"
  | "walkthrough"
  | "diagram";

/**
 * How this deployment reviews.
 *
 * Edited on /settings/review and read by the ingester on every pass, so
 * changing a threshold takes effect on the next poll rather than on the next
 * restart. komodo.yaml supplies the starting values; this is the layer a team
 * changes without editing a file on the server.
 *
 * Stored as one JSON row rather than a column per field. The object is small,
 * always read and written whole, and a settings screen grows fields faster
 * than a schema wants to grow columns — reading it merged over the defaults
 * means a field added tomorrow needs no migration and an old row stays valid.
 */
export interface OrgSettings {
  /** Re-review when a pull request's head moves. Off leaves the first verdict. */
  autoReviewNewCommits: boolean;
  reviewDraftPrs: boolean;
  /** Pull requests touching more files than this are skipped, not reviewed. */
  fileChangeLimit: number;
  /** Whether authorFilterTokens names who to skip or the only ones to review. */
  authorFilterMode: "exclude" | "include";
  /** GitHub logins, typically the bots nobody wants a review of. */
  authorFilterTokens: string[];
  updatePrDescription: boolean;
  summarySections: Record<SummarySectionKey, SummarySectionConfig>;
  /** Free text handed to the model with the diff. */
  customInstructions: string;
  /** Maps to a minimum severity: low → critical only, high → everything. */
  strictness: "low" | "medium" | "high";
  /** Prepended to whatever Komodo posts on the pull request. */
  commentHeader: string;
  promptToFixWithAi: boolean;
  useStatusChecks: boolean;
  /** The commit status passes at or above this confidence, 0–5. */
  requiredConfidence: number;
  postStatusComments: boolean;
  autoApprovePrs: boolean;
  maxAutoApproveRisk: ImpactLevel;
  autoEnableNewRepos: boolean;
  /**
   * Whether the rules on /custom-context are handed to the reviewer.
   *
   * A kill switch rather than a preference: a bad rule can quietly skew every
   * review, and turning the whole set off is faster than finding which one.
   */
  memoryEnabled: boolean;
  orgDisplayName: string;
}

/* ── The review body ─────────────────────────────────────────────────────── */

/**
 * The vocabularies below mirror @komodo/core's schema field for field, but are
 * re-declared rather than imported: this package has no dependency on core,
 * and the port's whole promise is that a driver returns plain structural types.
 * packages/ingest/src/map.ts is where the two meet — if core's unions change,
 * that file stops compiling, which is the intended alarm.
 */
export type JudgementSeverity = "critical" | "major" | "minor" | "trivial";

export type JudgementKind = "Choice" | "Risk" | "Behaviour" | "Domain" | "Unsure";

/** Where an answer lands in the verdict. */
export type Bucket = "Blocks" | "Agreed" | "Asked" | "Passed on";

/** One of the four answers a judgement offers. */
export interface JudgementOption {
  label: string;
  bucket: Bucket;
}

export interface WalkthroughEntry {
  files: string[];
  summary: string;
}

/**
 * One review run, pinned to the head it read.
 *
 * Immutable by construction: the id is `${prId}@${headSha}`, the same id as the
 * judgment it belongs to, so a re-review of a new push writes a new row and the
 * old one stays readable forever.
 */
export interface Review {
  id: string;
  prId: string;
  headSha: string;
  provider: string;
  model: string | null;
  /** Markdown bullets grouped by change type, as the reviewer wrote them. */
  summary: string;
  walkthrough: WalkthroughEntry[];
  /** Merge confidence, 0–5. */
  confidence: number;
  /** Human review effort, 1–5. */
  effort: number;
  /** One line justifying the confidence score. */
  verdictLine: string;
  /** Mermaid sequenceDiagram source, when the run produced one. */
  diagram: string | null;
  /** The `.komodo/reviews/<id>.json` this row was built from. */
  recordId: string;
  /**
   * The GitHub comment carrying the answered outcome, once someone has closed
   * the review out. Null until then, and the pair is what lets the closing
   * screen say "posted" after a reload rather than offering the button again.
   */
  receiptUrl: string | null;
  receiptPostedAt: number | null;
  createdAt: number;
}

/** One file the run read, with the patch it read. */
export interface ReviewFile {
  reviewId: string;
  path: string;
  additions: number;
  deletions: number;
  status: string;
  patch: string | null;
}

/**
 * One judgement: a question put to a human, and the four answers it offers.
 *
 * `postable` is false when GitHub's review API could not have anchored a
 * comment here — below min_severity, or on a line the diff does not expose.
 * Komodo keeps those; only the posting step filters on it.
 */
export interface ReviewJudgement {
  id: string;
  reviewId: string;
  /** Position in the run. Drives "3 of 7" and the progress pips. */
  ordinal: number;
  path: string;
  line: number;
  endLine: number | null;
  severity: JudgementSeverity;
  kind: JudgementKind;
  tag: string;
  title: string;
  lede: string;
  detail: string;
  ask: string;
  sources: string[];
  sourceNote: string;
  /** Plain-text excerpt for the collapsed "Show me the code" block. */
  code: string;
  options: JudgementOption[];
  suggestion: string | null;
  fixPrompt: string;
  postable: boolean;
}

/**
 * One entry in the decision ledger.
 *
 * Append-only. Answering again appends; undoing appends a row with a null
 * bucket. The newest row per judgement is the current answer, and the history
 * behind it is the record of how a team actually decided.
 */
export interface Answer {
  id: string;
  judgementId: string;
  reviewId: string;
  /** GitHub login of whoever answered. */
  actorLogin: string;
  /** Null means the answer was withdrawn. */
  bucket: Bucket | null;
  optionLabel: string | null;
  /** What they typed when they chose "I have a question first". */
  note: string | null;
  blocking: boolean;
  createdAt: number;
}

/**
 * One person's opinion of one judgement: was this worth raising?
 *
 * The counts on a queue row are derived from these rather than stored, so a
 * vote cast and a vote counted cannot drift apart. One row per (judgement,
 * actor) — voting again replaces, voting the same way twice does nothing.
 */
export interface JudgementVote {
  judgementId: string;
  actorLogin: string;
  /** +1 useful, -1 noise. */
  value: 1 | -1;
  createdAt: number;
}

/* ── Integrations ────────────────────────────────────────────────────────── */

/**
 * A tracker Komodo can read an issue out of.
 *
 * Deliberately narrow. Full OAuth against three vendors is disproportionate
 * for a single-team self-hosted install, and what a review actually needs from
 * a tracker is one thing: when a pull request names an issue, what does that
 * issue say? So an integration is an admin-pasted API token and the reviewer
 * uses it to fetch context.
 */
export type IntegrationProvider = "linear" | "jira";

export type IntegrationStatus = "connected" | "not_configured" | "error";

export interface Integration {
  id: string;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  /**
   * Jira needs the site to talk to; Linear does not. Empty for providers that
   * have one endpoint.
   */
  baseUrl: string;
  /** For Jira's basic auth, which is `email:token`. Empty for Linear. */
  account: string;
  connectedAt: number | null;
  /** Why the last fetch failed, when status is `error`. */
  lastError: string | null;
}

/* ── API keys ────────────────────────────────────────────────────────────── */

/**
 * A key someone can call the HTTP API with.
 *
 * The secret is not here and never leaves the process that generated it: only
 * a SHA-256 hash is stored, and the plaintext is returned exactly once, at
 * creation. `prefix` is the first few characters, so a person can tell two
 * keys apart in a list without the list being a list of credentials.
 */
export interface ApiKey {
  id: string;
  name: string;
  /** The leading characters of the key, for recognition. Never the whole key. */
  prefix: string;
  createdAt: number;
  /** Null until it has been used. */
  lastUsedAt: number | null;
}

/* ── Custom context ──────────────────────────────────────────────────────── */

/**
 * `rule` is a sentence someone wrote. `file` points at paths in the repository
 * whose contents are read at review time — a CLAUDE.md, an AGENTS.md, a
 * .cursorrules — so the conventions a team already writes down do not have to
 * be typed in twice.
 */
export type MemoryKind = "rule" | "file";

export type MemoryStatus = "active" | "inactive";

/**
 * One thing this team has taught Komodo.
 *
 * Scope is two independent narrowings: `repoId` (or a cluster's repositories)
 * limits which repositories it applies to, and `fileGlob` limits which of a
 * pull request's files have to be touched for it to apply at all. Both empty
 * means it applies everywhere, which is a real and common choice.
 */
export interface MemoryRule {
  id: string;
  description: string;
  kind: MemoryKind;
  /** The rule text, or for a `file` rule the glob naming the files to read. */
  pattern: string;
  /** Null applies it to every repository. */
  repoId: string | null;
  /** Empty applies it to every file. */
  fileGlob: string;
  status: MemoryStatus;
  createdAt: number;
  updatedAt: number;
}

/**
 * A named set of repositories, so a rule can be scoped to "the iOS app and
 * its dependencies" without being restated per repository.
 */
export interface RepoCluster {
  id: string;
  name: string;
  memberRepoIds: string[];
  createdAt: number;
}

/**
 * One time a rule was handed to the reviewer.
 *
 * The usage figures on the memory screens are counted from these rather than
 * incremented on the rule, for the same reason the queue's engagement numbers
 * are: a counter and the thing it counts drift, and only one of them is the
 * truth.
 */
export interface MemoryRuleUse {
  ruleId: string;
  reviewId: string;
  /**
   * The repository files this use resolved to, for a `file` rule.
   *
   * Recorded rather than re-derived because only the ingester ever has a
   * checkout: the web server holds no working tree, so "which files does this
   * rule match" is a question it cannot answer for itself. Empty for a rule
   * whose text is its own content.
   */
  paths: string[];
  createdAt: number;
}

/** One repository file a rule has resolved to, and how often. */
export interface MemoryFile {
  path: string;
  /** Reviews this file was read for. */
  uses: number;
}

/** A rule with the figures the memory screens show, counted at read time. */
export interface MemoryRuleStats extends MemoryRule {
  /**
   * The files this rule has actually resolved to across its uses — the
   * knowledge base, as opposed to the glob that produced it.
   */
  files: MemoryFile[];
  /** Reviews this rule has been handed to, ever. */
  usageCount: number;
  /** …and in the last 30 days. */
  usesThisMonth: number;
  /**
   * Of the judgements citing this rule, the share a reviewer agreed with
   * rather than passed on. Null until there are any.
   */
  acceptanceRate: number | null;
  upvotes: number;
  downvotes: number;
}

/** A review run and everything it holds, as the detail page needs it. */
export interface ReviewDetail {
  review: Review;
  judgements: ReviewJudgement[];
  /** Newest answer per judgement id. */
  answers: Answer[];
  /** Every vote on this run's judgements — at most one per person per one. */
  votes: JudgementVote[];
}
