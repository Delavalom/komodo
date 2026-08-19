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
  Finding,
  Judgment,
  Member,
  Organization,
  PullRequest,
  Repository,
  Team,
  Verdict,
  ImpactLevel,
  ReviewStatus,
} from "./types.js";

/** Everything one page of the app needs, in one round trip. */
export interface QueueSnapshot {
  organization: Organization;
  teams: Team[];
  members: Member[];
  repositories: Repository[];
  judgments: Judgment[];
  findings: Finding[];
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

  /**
   * Pull requests whose current head has no completed judgment — the
   * ingester's work list. Keyed on (prId, headSha), so a restart resumes
   * mid-run without re-reviewing what already finished, and a new push
   * re-enters the list on its own.
   */
  listPullRequestsNeedingReview(): Promise<PullRequest[]>;
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
  /**
   * Engagement counters. The ingester never passes these — it lets
   * reviewCount increment itself and leaves the rest to accumulate from user
   * activity. Only the seeder sets them, to make the dev dataset look
   * lived-in rather than freshly reviewed.
   */
  counters?: {
    reviewCount: number;
    addressedComments: number;
    totalComments: number;
    upvotes: number;
    downvotes: number;
  };
}

export interface FindingInput {
  title: string;
  body: string;
  severity: Finding["severity"];
  isSecurity: boolean;
  filePath: string;
}

export interface StoreWriter {
  upsertRepository(repo: Omit<Repository, "id"> & { id?: string }): Promise<string>;

  /** Idempotent on (repoId, number). Never touches the PR's judgment. */
  upsertPullRequest(pr: PullRequestInput): Promise<string>;

  /**
   * Idempotent on (prId, headSha) — the property that makes the ingester
   * restart-safe. Returns the judgment id.
   */
  upsertJudgment(input: JudgmentInput): Promise<string>;

  /** Replaces a judgment's findings wholesale, so a re-review can't duplicate. */
  replaceFindings(judgmentId: string, findings: FindingInput[]): Promise<void>;

  setRepoEnabled(repoId: string, enabled: boolean): Promise<void>;

  /** Marks judgments pending so the ingester picks them up again. */
  retriggerReviews(judgmentIds: string[]): Promise<void>;

  saveTeam(team: Omit<Team, "id"> & { id?: string }): Promise<string>;
  deleteTeam(teamId: string): Promise<void>;

  saveMember(member: Omit<Member, "id"> & { id?: string }): Promise<string>;
  removeMember(memberId: string): Promise<void>;
}

export interface KomodoStore extends StoreReader, StoreWriter {
  /** Releases the underlying handle. Safe to call twice. */
  close(): void;
}
