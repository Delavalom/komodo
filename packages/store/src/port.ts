/**
 * The persistence port.
 *
 * `komodo dev` and `komodo serve` run the same web app against different
 * storage. That only works if nothing above this interface knows which driver
 * it got, so every driver returns the plain structural types in ./types.ts —
 * no database row shapes, no driver handles, nothing that leaks upward.
 *
 * Split into reads and writes for the same reason @komodo/core's ReviewStore
 * is: the web app loads through a server component but mutates through server
 * actions, so only half of this is ever reachable from a client component.
 */
import type {
  Answer,
  AIReviewJob,
  ApiKey,
  Bucket,
  Finding,
  Integration,
  Judgment,
  Member,
  Organization,
  OrgSettings,
  PullRequest,
  Repository,
  Review,
  ReviewDetail,
  ReviewFile,
  JudgementVote,
  MemoryRule,
  MemoryRuleStats,
  RepoCluster,
  ReviewJudgement,
  Team,
  Verdict,
  ImpactLevel,
  ReviewStatus,
  ReviewTrigger,
} from "./types.js";

/** Everything one page of the app needs, in one round trip. */
export interface QueueSnapshot {
  organization: Organization;
  /**
   * How this deployment reviews. Part of the snapshot because the settings
   * screens render from it like every other surface, and because the header
   * reads orgDisplayName on every page.
   */
  settings: OrgSettings;
  teams: Team[];
  members: Member[];
  repositories: Repository[];
  /** Raw GitHub inventory. A PR exists here before Komodo reviews it. */
  pullRequests: PullRequest[];
  /** Durable AI intent, separate from results in judgments. */
  aiReviewJobs: AIReviewJob[];
  judgments: Judgment[];
  findings: Finding[];
  /** What the team has taught Komodo, with its counted usage figures. */
  memoryRules: MemoryRuleStats[];
  repoClusters: RepoCluster[];
  /** Never with a secret — see ApiKey. */
  apiKeys: ApiKey[];
  /** Never with a token — see Integration. */
  integrations: Integration[];
}

export interface StoreReader {
  /**
   * The whole review dataset.
   *
   * Deliberately not paginated and not filtered: every analytics panel is
   * DERIVED from this list rather than stored, so a filtered table and its
   * summary widgets can never disagree. A team's open PRs number in the
   * hundreds, not the millions.
   */
  snapshot(): Promise<QueueSnapshot>;

  listPullRequests(): Promise<PullRequest[]>;

  listAIReviewJobs(): Promise<AIReviewJob[]>;

  /**
   * Pull requests whose current head has no settled judgment — the ingester's
   * work list. Keyed on (prId, headSha), so a restart resumes mid-run without
   * re-reviewing what already finished, and a new push re-enters the list on
   * its own.
   *
   * `settled` means completed or skipped. An errored review is not settled and
   * comes back on the next pass.
   *
   * `reReview: false` narrows it to pull requests that have never had a
   * completed review at any head — what `auto_review.on_new_commits: false`
   * asks for. Without it, turning that setting off would have no way to reach
   * the query and the poller would re-review every push regardless.
   */
  listPullRequestsNeedingReview(options?: {
    reReview?: boolean;
  }): Promise<PullRequest[]>;

  /**
   * One review run with its judgements and the current answer to each.
   *
   * Deliberately not part of the snapshot: a run carries every judgement body
   * the reviewer wrote, and the snapshot is loaded whole on every page of the
   * app. This is read by the one route that shows it.
   */
  loadReview(reviewId: string): Promise<ReviewDetail | null>;

  /** The newest run for a pull request — what the detail page opens on. */
  loadLatestReview(prId: string): Promise<ReviewDetail | null>;

  /** Every run for a pull request, newest first. History is never overwritten. */
  listReviewRuns(prId: string): Promise<Review[]>;

  /** The patches, read only when someone opens the diff. */
  loadReviewFiles(reviewId: string): Promise<ReviewFile[]>;

  /** The full ledger for a run, oldest first — including withdrawn answers. */
  listAnswers(reviewId: string): Promise<Answer[]>;

  /**
   * One small fact about the deployment rather than about a review — when the
   * poller last finished a pass, and whatever joins it later. Null when the
   * key has never been written.
   */
  getMeta(key: string): Promise<string | null>;

  /**
   * How this deployment reviews, folded over the defaults.
   *
   * Also on the snapshot, but read on its own by the ingester, which has no
   * use for the rest of it and runs this every pass.
   */
  loadSettings(): Promise<OrgSettings>;

  /** Every vote on a run's judgements — who, and which way. */
  listVotes(reviewId: string): Promise<JudgementVote[]>;

  /**
   * What this team has taught Komodo, with the figures the screens show.
   *
   * Stats are counted at read time from `memory_rule_uses` and the answer
   * ledger; nothing here is a stored counter.
   */
  listMemoryRules(): Promise<MemoryRuleStats[]>;

  listRepoClusters(): Promise<RepoCluster[]>;

  /** Every key, without any secret. Enough to name and revoke one. */
  listApiKeys(): Promise<ApiKey[]>;

  /**
   * The key matching a presented secret, or null.
   *
   * Takes the hash rather than the secret so the plaintext never crosses the
   * port — the caller hashes, and a driver cannot leak what it never held.
   * Records the use as a side effect: `lastUsedAt` is the only thing that
   * makes an abandoned key identifiable later.
   */
  findApiKeyByHash(keyHash: string): Promise<ApiKey | null>;

  /** Connected trackers, without their tokens. */
  listIntegrations(): Promise<Integration[]>;

  /**
   * One integration with its token, for the ingester alone.
   *
   * Separate from `listIntegrations` so the token has exactly one path out of
   * the store, and that path is not the one the UI takes.
   */
  loadIntegrationToken(
    provider: Integration["provider"],
  ): Promise<{ integration: Integration; token: string } | null>;
}

/** What the reviewer writes once a run completes. */
export interface ReviewInput {
  prId: string;
  headSha: string;
  provider: string;
  model?: string | null;
  summary: string;
  walkthrough: Review["walkthrough"];
  confidence: number;
  effort: number;
  verdictLine: string;
  diagram?: string | null;
  recordId: string;
  /** In the order they should be answered. Ordinals are assigned here. */
  judgements: Omit<ReviewJudgement, "id" | "reviewId" | "ordinal">[];
  files: Omit<ReviewFile, "reviewId">[];
}

/** One entry appended to the decision ledger. */
export interface AnswerInput {
  judgementId: string;
  actorLogin: string;
  /** Null withdraws the current answer. */
  bucket: Bucket | null;
  optionLabel?: string | null;
  note?: string | null;
  blocking?: boolean;
}

/** What the poller writes. Git facts only. */
export interface PullRequestInput
  extends Omit<PullRequest, "id"> {
  /** Stable across polls: `${repoId}#${number}`. */
  id?: string;
}

/** What the reviewer writes once a review completes. */
export interface JudgmentInput {
  prId: string;
  headSha: string;
  verdict: Verdict | null;
  status: ReviewStatus;
  impact: ImpactLevel;
  score: number;
}

export interface FindingInput {
  title: string;
  body: string;
  severity: Finding["severity"];
  isSecurity: boolean;
  filePath: string;
  /**
   * The review judgement this finding summarises, when the caller knows it.
   *
   * The link is explicit rather than inferred, because a finding's status is
   * read off the answer to its judgement and the alternative — matching on
   * the title text — is a join between two independently-produced strings.
   * One of them gaining a full stop is enough to break it silently, which is
   * exactly what the seeder did.
   */
  judgementId?: string | null;
}

export interface StoreWriter {
  /** Replaces the single organization row. */
  setOrganization(org: Organization): Promise<void>;

  upsertRepository(repo: Omit<Repository, "id"> & { id?: string }): Promise<string>;

  /** Idempotent on (repoId, number). Never touches the PR's judgment. */
  upsertPullRequest(pr: PullRequestInput): Promise<string>;

  /** Idempotent on the immutable `(prId, headSha)` job id. */
  requestAIReview(input: {
    prId: string;
    headSha: string;
    trigger: ReviewTrigger;
    requestedBy?: string | null;
    requestedAt: number;
  }): Promise<string>;

  /** Atomically leases the next queued or abandoned job. */
  claimNextAIReview(input: {
    workerId: string;
    now: number;
    leaseMs: number;
  }): Promise<{ job: AIReviewJob; pr: PullRequest } | null>;

  /** Settles a lease only when it is still owned by this worker. */
  finishAIReviewJob(input: {
    jobId: string;
    workerId: string;
    state: "completed" | "skipped" | "failed" | "cancelled";
    finishedAt: number;
    error?: string | null;
  }): Promise<boolean>;

  /**
   * Idempotent on (prId, headSha) — the property that makes the ingester
   * restart-safe. Returns the judgment id.
   */
  upsertJudgment(input: JudgmentInput): Promise<string>;

  /** Replaces a judgment's findings wholesale, so a re-review can't duplicate. */
  replaceFindings(judgmentId: string, findings: FindingInput[]): Promise<void>;

  /**
   * Writes the review body for one run. Idempotent on (prId, headSha) like the
   * judgment it shares an id with, so re-running the same head replaces the
   * body rather than duplicating it — but never touches another run's, and
   * never touches the answer ledger.
   *
   * Returns the review id.
   */
  saveReview(input: ReviewInput): Promise<string>;

  /**
   * Appends to the decision ledger. Nothing here is ever updated or deleted:
   * the newest row for a judgement is its current answer, and the rows behind
   * it are how the team got there.
   */
  recordAnswer(input: AnswerInput): Promise<void>;

  /**
   * Records that a run's outcome was posted to GitHub, and where.
   *
   * Separate from `saveReview` because it is the one fact about a run that a
   * person creates rather than the reviewer: everything else in the row came
   * out of the model, and this came out of someone deciding they were done.
   */
  markReceiptPosted(reviewId: string, url: string): Promise<void>;

  setRepoEnabled(repoId: string, enabled: boolean): Promise<void>;

  /** Marks judgments pending so the ingester picks them up again. */
  retriggerReviews(judgmentIds: string[]): Promise<void>;

  saveTeam(team: Omit<Team, "id"> & { id?: string }): Promise<string>;
  deleteTeam(teamId: string): Promise<void>;

  saveMember(member: Omit<Member, "id"> & { id?: string }): Promise<string>;
  removeMember(memberId: string): Promise<void>;

  /** Upserts one deployment-level fact. See StoreReader.getMeta. */
  setMeta(key: string, value: string): Promise<void>;

  /**
   * Records what someone thought of a judgement.
   *
   * One row per (judgement, actor): voting again replaces rather than
   * accumulates, and `value: null` withdraws. Unlike the answer ledger this
   * keeps no history — an opinion about a question is not a decision about
   * the code, and nobody needs to know you changed your mind about it.
   */
  recordVote(input: {
    judgementId: string;
    actorLogin: string;
    value: 1 | -1 | null;
  }): Promise<void>;

  /** Creates or updates one rule. Returns its id. */
  saveMemoryRule(
    rule: Omit<MemoryRule, "id" | "createdAt" | "updatedAt"> & { id?: string },
  ): Promise<string>;

  deleteMemoryRule(ruleId: string): Promise<void>;

  saveRepoCluster(
    cluster: Omit<RepoCluster, "id" | "createdAt"> & { id?: string },
  ): Promise<string>;

  deleteRepoCluster(clusterId: string): Promise<void>;

  /**
   * Stores a key by its hash. The caller generates the secret and shows it
   * once; nothing here can reconstruct it.
   */
  createApiKey(input: {
    name: string;
    keyHash: string;
    prefix: string;
  }): Promise<ApiKey>;

  deleteApiKey(keyId: string): Promise<void>;

  /** Connects a tracker, or replaces the credentials of one already there. */
  saveIntegration(input: {
    provider: Integration["provider"];
    token: string;
    baseUrl?: string;
    account?: string;
  }): Promise<string>;

  disconnectIntegration(integrationId: string): Promise<void>;

  /** Records that a fetch failed, so the screen can say so. */
  setIntegrationError(
    provider: Integration["provider"],
    error: string | null,
  ): Promise<void>;

  /**
   * Records that a run was given these rules.
   *
   * Written by the ingester after it selects them, which is what makes the
   * usage figures on the memory screens describe something that happened
   * rather than something a seeder invented.
   */
  recordMemoryUse(
    reviewId: string,
    uses: { ruleId: string; paths?: string[] }[],
  ): Promise<void>;

  /**
   * Applies a partial change to the review settings.
   *
   * A patch rather than a whole object because the settings screen saves one
   * toggle at a time, and two people on two screens must not overwrite each
   * other's unrelated fields.
   */
  saveSettings(patch: Partial<OrgSettings>): Promise<void>;
}

export interface KomodoStore extends StoreReader, StoreWriter {
  /** Releases the underlying handle. Safe to call twice. */
  close(): void;
}
