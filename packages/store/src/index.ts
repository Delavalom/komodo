/**
 * Client-safe entry point: types and the port, nothing that touches Node.
 *
 * The drivers live behind their own subpath exports (`@komodo/store/sqlite`)
 * because importing one pulls in node:sqlite. The API-key helpers live behind
 * `@komodo/store/api-key` for the same reason — they reach node:crypto.
 * Client components import from here, where the only runtime exports are pure
 * functions over plain data, and never from a driver.
 */
export type {
  Answer,
  AIReviewJob,
  AIReviewJobState,
  ApiKey,
  Bucket,
  Finding,
  FindingStatus,
  EvidenceKind,
  ImpactLevel,
  Integration,
  IntegrationProvider,
  IntegrationStatus,
  Judgment,
  JudgementKind,
  JudgementOption,
  JudgementVote,
  ReviewFocus,
  MemoryFile,
  MemoryKind,
  MemoryRule,
  MemoryRuleStats,
  MemoryRuleUse,
  MemoryStatus,
  JudgementSeverity,
  Member,
  MemberGithubIdentity,
  MemberRole,
  Organization,
  OrgSettings,
  ChecksState,
  PullRequest,
  PullRequestChecks,
  PullRequestComment,
  PullRequestCommentKind,
  PullRequestConversation,
  PullRequestState,
  RepoCluster,
  Repository,
  Review,
  ReviewDetail,
  ReviewFile,
  ReviewJudgement,
  VerificationEntry,
  VerificationRequirement,
  VerificationResult,
  VerificationSummary,
  ReviewStatus,
  ReviewTrigger,
  Severity,
  SummarySectionConfig,
  SummarySectionKey,
  Team,
  Verdict,
  WalkthroughEntry,
} from "./types.js";

export type {
  AnswerInput,
  FindingInput,
  JudgmentInput,
  KomodoStore,
  PullRequestInput,
  QueueSnapshot,
  ReviewInput,
  VerificationInput,
  StoreReader,
  StoreWriter,
} from "./port.js";

export { verdictFor } from "./verdict.js";
export { pickActor } from "./actor.js";
export { needsReviewFrom, type QueueLensViewer } from "./queue-lens.js";
export { readChecks, type StoredChecks } from "./checks.js";
export {
  easyWin,
  type EasyWin,
  type EasyWinInput,
  type EasyWinSignal,
} from "./easy-win.js";
export {
  META_DISCOVERY_REQUESTED_AT,
  META_LAST_DISCOVERY_AT,
  META_LAST_DISCOVERY_ERROR,
  META_LAST_POLL_AT,
  META_LAST_POLL_ERROR,
  META_SETTINGS_INITIALIZED,
} from "./meta.js";
export { DEFAULT_ORG_SETTINGS, mergeSettings } from "./settings.js";
