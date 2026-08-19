/**
 * SQLite driver — what `komodo dev` runs on.
 *
 * Uses node:sqlite, so there is no native module to compile and no service to
 * start: the whole store is one file under .komodo/. That is the difference
 * between "install and run" and "install, then install Postgres".
 *
 * Ids are derived, not generated: a pull request is `${repoId}#${number}` and
 * a judgment is `${prId}@${headSha}`. Idempotency then falls out of the
 * primary key — the poller can re-upsert the same PR forever, and a review
 * that dies halfway resumes onto the same row instead of a duplicate.
 */
import { DatabaseSync } from "node:sqlite";

import type {
  FindingInput,
  JudgmentInput,
  KomodoStore,
  PullRequestInput,
  QueueSnapshot,
} from "./port.js";
import type {
  Finding,
  Judgment,
  Member,
  Organization,
  PullRequest,
  Repository,
  Team,
} from "./types.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS organizations (
  slug         TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  role         TEXT NOT NULL,
  trialEndsAt  INTEGER NOT NULL,
  plan         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  name        TEXT NOT NULL,
  githubLogin TEXT NOT NULL,
  role        TEXT NOT NULL,
  avatarSeed  TEXT NOT NULL,
  isYou       INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS members_login ON members (githubLogin);

CREATE TABLE IF NOT EXISTS teams (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS team_members (
  teamId   TEXT NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  memberId TEXT NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  PRIMARY KEY (teamId, memberId)
);

CREATE TABLE IF NOT EXISTS team_repos (
  teamId TEXT NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  repoId TEXT NOT NULL REFERENCES repositories (id) ON DELETE CASCADE,
  PRIMARY KEY (teamId, repoId)
);

CREATE TABLE IF NOT EXISTS repositories (
  id          TEXT PRIMARY KEY,
  owner       TEXT NOT NULL,
  name        TEXT NOT NULL,
  provider    TEXT NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1,
  reviewCount INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS repositories_full ON repositories (owner, name);

CREATE TABLE IF NOT EXISTS pull_requests (
  id                TEXT PRIMARY KEY,
  repoId            TEXT NOT NULL REFERENCES repositories (id) ON DELETE CASCADE,
  number            INTEGER NOT NULL,
  title             TEXT NOT NULL,
  author            TEXT NOT NULL,
  url               TEXT NOT NULL,
  headSha           TEXT NOT NULL,
  state             TEXT NOT NULL,
  isDraft           INTEGER NOT NULL DEFAULT 0,
  requestedReviewers TEXT NOT NULL DEFAULT '[]',
  approvals         TEXT NOT NULL DEFAULT '[]',
  changesRequested  TEXT NOT NULL DEFAULT '[]',
  additions         INTEGER NOT NULL DEFAULT 0,
  deletions         INTEGER NOT NULL DEFAULT 0,
  changedFiles      INTEGER NOT NULL DEFAULT 0,
  createdAt         INTEGER NOT NULL,
  updatedAt         INTEGER NOT NULL,
  mergedAt          INTEGER
);
CREATE INDEX IF NOT EXISTS pull_requests_repo ON pull_requests (repoId);
CREATE INDEX IF NOT EXISTS pull_requests_updated ON pull_requests (updatedAt);

CREATE TABLE IF NOT EXISTS judgments (
  id                TEXT PRIMARY KEY,
  prId              TEXT NOT NULL REFERENCES pull_requests (id) ON DELETE CASCADE,
  headSha           TEXT NOT NULL,
  verdict           TEXT,
  status            TEXT NOT NULL,
  impact            TEXT NOT NULL,
  score             REAL NOT NULL DEFAULT 0,
  reviewCount       INTEGER NOT NULL DEFAULT 0,
  addressedComments INTEGER NOT NULL DEFAULT 0,
  totalComments     INTEGER NOT NULL DEFAULT 0,
  upvotes           INTEGER NOT NULL DEFAULT 0,
  downvotes         INTEGER NOT NULL DEFAULT 0,
  createdAt         INTEGER NOT NULL,
  updatedAt         INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS judgments_pr_head ON judgments (prId, headSha);

CREATE TABLE IF NOT EXISTS findings (
  id         TEXT PRIMARY KEY,
  judgmentId TEXT NOT NULL REFERENCES judgments (id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  severity   TEXT NOT NULL,
  isSecurity INTEGER NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'open',
  filePath   TEXT NOT NULL,
  createdAt  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS findings_judgment ON findings (judgmentId);
`;

const DEFAULT_ORG: Organization = {
  slug: "local",
  name: "Local",
  role: "admin",
  trialEndsAt: 0,
  plan: "pro",
};

type Row = Record<string, unknown>;

const bool = (v: unknown): boolean => Boolean(v);
const list = (v: unknown): string[] => JSON.parse(String(v ?? "[]")) as string[];
const num = (v: unknown): number => Number(v ?? 0);
const str = (v: unknown): string => String(v ?? "");

/** SQLite has no boolean, so every flag crosses the boundary as 0 or 1. */
const flag = (v: boolean): number => (v ? 1 : 0);

export interface SqliteStoreOptions {
  /** File path, or ":memory:" for tests. */
  path: string;
}

export class SqliteStore implements KomodoStore {
  private readonly db: DatabaseSync;
  private closed = false;

  constructor(options: SqliteStoreOptions) {
    this.db = new DatabaseSync(options.path);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec(SCHEMA);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }

  /* ── Reads ──────────────────────────────────────────────────────────── */

  async snapshot(): Promise<QueueSnapshot> {
    return {
      organization: this.readOrganization(),
      teams: this.readTeams(),
      members: this.readMembers(),
      repositories: this.readRepositories(),
      judgments: this.readJudgments(),
      findings: this.readFindings(),
    };
  }

  async listPullRequests(): Promise<PullRequest[]> {
    const rows = this.db
      .prepare("SELECT * FROM pull_requests ORDER BY updatedAt DESC")
      .all() as Row[];
    return rows.map(toPullRequest);
  }

  async listPullRequestsNeedingReview(): Promise<PullRequest[]> {
    // LEFT JOIN on the exact (prId, headSha) the PR is at now. A judgment for
    // an older head does not count, which is what makes a new push re-enter
    // the work list without any explicit invalidation.
    const rows = this.db
      .prepare(
        `SELECT p.* FROM pull_requests p
         LEFT JOIN judgments j
           ON j.prId = p.id AND j.headSha = p.headSha AND j.status = 'completed'
         WHERE p.state = 'open' AND p.isDraft = 0 AND j.id IS NULL
         ORDER BY p.updatedAt ASC`,
      )
      .all() as Row[];
    return rows.map(toPullRequest);
  }

  private readOrganization(): Organization {
    const row = this.db.prepare("SELECT * FROM organizations LIMIT 1").get() as
      | Row
      | undefined;
    if (!row) return DEFAULT_ORG;
    return {
      slug: str(row.slug),
      name: str(row.name),
      role: str(row.role) as Organization["role"],
      trialEndsAt: num(row.trialEndsAt),
      plan: str(row.plan) as Organization["plan"],
    };
  }

  private readTeams(): Team[] {
    const teams = this.db.prepare("SELECT * FROM teams ORDER BY name").all() as Row[];
    const members = this.db.prepare("SELECT * FROM team_members").all() as Row[];
    const repos = this.db.prepare("SELECT * FROM team_repos").all() as Row[];
    return teams.map((t) => ({
      id: str(t.id),
      name: str(t.name),
      memberIds: members
        .filter((m) => m.teamId === t.id)
        .map((m) => str(m.memberId)),
      watchedRepoIds: repos
        .filter((r) => r.teamId === t.id)
        .map((r) => str(r.repoId)),
    }));
  }

  private readMembers(): Member[] {
    const rows = this.db.prepare("SELECT * FROM members ORDER BY name").all() as Row[];
    return rows.map((r) => ({
      id: str(r.id),
      email: str(r.email),
      name: str(r.name),
      githubLogin: str(r.githubLogin),
      role: str(r.role) as Member["role"],
      avatarSeed: str(r.avatarSeed),
      isYou: bool(r.isYou),
    }));
  }

  private readRepositories(): Repository[] {
    const rows = this.db
      .prepare("SELECT * FROM repositories ORDER BY owner, name")
      .all() as Row[];
    return rows.map((r) => ({
      id: str(r.id),
      owner: str(r.owner),
      name: str(r.name),
      provider: str(r.provider) as Repository["provider"],
      enabled: bool(r.enabled),
      reviewCount: num(r.reviewCount),
    }));
  }

  private readJudgments(): Judgment[] {
    // The flat read-model the UI consumes: the judgment's own columns plus the
    // git facts joined in from the pull request it judges. The judgment id is
    // aliased so it survives spreading the PR fields in beside it.
    const rows = this.db
      .prepare(
        `SELECT j.id AS judgmentId, j.verdict, j.status, j.impact, j.score,
                j.reviewCount, j.addressedComments, j.totalComments,
                j.upvotes, j.downvotes,
                p.id AS prId, p.repoId, p.number, p.title, p.author, p.url,
                p.headSha, p.state, p.isDraft, p.requestedReviewers, p.approvals,
                p.changesRequested, p.additions, p.deletions, p.changedFiles,
                p.createdAt, p.updatedAt, p.mergedAt
         FROM judgments j
         JOIN pull_requests p ON p.id = j.prId
         ORDER BY p.updatedAt DESC`,
      )
      .all() as Row[];

    return rows.map((r) => {
      const pr = toPullRequest(r);
      return {
        ...pr,
        id: str(r.judgmentId),
        prId: pr.id,
        verdict:
          r.verdict === null ? null : (str(r.verdict) as Judgment["verdict"]),
        status: str(r.status) as Judgment["status"],
        impact: str(r.impact) as Judgment["impact"],
        score: num(r.score),
        reviewCount: num(r.reviewCount),
        addressedComments: num(r.addressedComments),
        totalComments: num(r.totalComments),
        upvotes: num(r.upvotes),
        downvotes: num(r.downvotes),
      };
    });
  }

  private readFindings(): Finding[] {
    const rows = this.db
      .prepare("SELECT * FROM findings ORDER BY createdAt DESC")
      .all() as Row[];
    return rows.map((r) => ({
      id: str(r.id),
      judgmentId: str(r.judgmentId),
      title: str(r.title),
      body: str(r.body),
      severity: str(r.severity) as Finding["severity"],
      isSecurity: bool(r.isSecurity),
      status: str(r.status) as Finding["status"],
      filePath: str(r.filePath),
      createdAt: num(r.createdAt),
    }));
  }

  /* ── Writes ─────────────────────────────────────────────────────────── */

  async upsertRepository(
    repo: Omit<Repository, "id"> & { id?: string },
  ): Promise<string> {
    const id = repo.id ?? `${repo.owner}/${repo.name}`;
    this.db
      .prepare(
        `INSERT INTO repositories (id, owner, name, provider, enabled, reviewCount)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           owner = excluded.owner, name = excluded.name,
           provider = excluded.provider, enabled = excluded.enabled`,
      )
      .run(id, repo.owner, repo.name, repo.provider, flag(repo.enabled), repo.reviewCount);
    return id;
  }

  async upsertPullRequest(pr: PullRequestInput): Promise<string> {
    const id = pr.id ?? `${pr.repoId}#${pr.number}`;
    this.db
      .prepare(
        `INSERT INTO pull_requests
           (id, repoId, number, title, author, url, headSha, state, isDraft,
            requestedReviewers, approvals, changesRequested,
            additions, deletions, changedFiles, createdAt, updatedAt, mergedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           title = excluded.title, author = excluded.author, url = excluded.url,
           headSha = excluded.headSha, state = excluded.state,
           isDraft = excluded.isDraft,
           requestedReviewers = excluded.requestedReviewers,
           approvals = excluded.approvals,
           changesRequested = excluded.changesRequested,
           additions = excluded.additions, deletions = excluded.deletions,
           changedFiles = excluded.changedFiles,
           updatedAt = excluded.updatedAt, mergedAt = excluded.mergedAt`,
      )
      .run(
        id, pr.repoId, pr.number, pr.title, pr.author, pr.url, pr.headSha,
        pr.state, flag(pr.isDraft),
        JSON.stringify(pr.requestedReviewers),
        JSON.stringify(pr.approvals),
        JSON.stringify(pr.changesRequested),
        pr.additions, pr.deletions, pr.changedFiles,
        pr.createdAt, pr.updatedAt, pr.mergedAt,
      );
    return id;
  }

  async upsertJudgment(input: JudgmentInput): Promise<string> {
    const id = `${input.prId}@${input.headSha}`;
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO judgments
           (id, prId, headSha, verdict, status, impact, score, reviewCount,
            createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           verdict = excluded.verdict, status = excluded.status,
           impact = excluded.impact, score = excluded.score,
           reviewCount = judgments.reviewCount + 1,
           updatedAt = excluded.updatedAt`,
      )
      .run(
        id, input.prId, input.headSha, input.verdict, input.status,
        input.impact, input.score, now, now,
      );
    return id;
  }

  async replaceFindings(judgmentId: string, findings: FindingInput[]): Promise<void> {
    const now = Date.now();
    this.db.exec("BEGIN");
    try {
      this.db.prepare("DELETE FROM findings WHERE judgmentId = ?").run(judgmentId);
      const insert = this.db.prepare(
        `INSERT INTO findings
           (id, judgmentId, title, body, severity, isSecurity, status, filePath, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
      );
      findings.forEach((f, i) => {
        insert.run(
          `${judgmentId}:${i}`, judgmentId, f.title, f.body, f.severity,
          flag(f.isSecurity), f.filePath, now,
        );
      });
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  async setRepoEnabled(repoId: string, enabled: boolean): Promise<void> {
    this.db
      .prepare("UPDATE repositories SET enabled = ? WHERE id = ?")
      .run(flag(enabled), repoId);
  }

  async retriggerReviews(judgmentIds: string[]): Promise<void> {
    if (!judgmentIds.length) return;
    const holes = judgmentIds.map(() => "?").join(", ");
    this.db
      .prepare(
        `UPDATE judgments SET status = 'pending', verdict = NULL, updatedAt = ?
         WHERE id IN (${holes})`,
      )
      .run(Date.now(), ...judgmentIds);
  }

  async saveTeam(team: Omit<Team, "id"> & { id?: string }): Promise<string> {
    const id = team.id ?? `team_${slug(team.name)}`;
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(
          `INSERT INTO teams (id, name) VALUES (?, ?)
           ON CONFLICT (id) DO UPDATE SET name = excluded.name`,
        )
        .run(id, team.name);
      this.db.prepare("DELETE FROM team_members WHERE teamId = ?").run(id);
      this.db.prepare("DELETE FROM team_repos WHERE teamId = ?").run(id);
      const addMember = this.db.prepare(
        "INSERT INTO team_members (teamId, memberId) VALUES (?, ?)",
      );
      for (const m of team.memberIds) addMember.run(id, m);
      const addRepo = this.db.prepare(
        "INSERT INTO team_repos (teamId, repoId) VALUES (?, ?)",
      );
      for (const r of team.watchedRepoIds) addRepo.run(id, r);
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
    return id;
  }

  async deleteTeam(teamId: string): Promise<void> {
    this.db.prepare("DELETE FROM teams WHERE id = ?").run(teamId);
  }

  async saveMember(
    member: Omit<Member, "id"> & { id?: string },
  ): Promise<string> {
    const id = member.id ?? `member_${slug(member.githubLogin)}`;
    this.db
      .prepare(
        `INSERT INTO members (id, email, name, githubLogin, role, avatarSeed, isYou)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           email = excluded.email, name = excluded.name,
           githubLogin = excluded.githubLogin, role = excluded.role,
           avatarSeed = excluded.avatarSeed, isYou = excluded.isYou`,
      )
      .run(
        id, member.email, member.name, member.githubLogin, member.role,
        member.avatarSeed, flag(member.isYou),
      );
    return id;
  }

  async removeMember(memberId: string): Promise<void> {
    this.db.prepare("DELETE FROM members WHERE id = ?").run(memberId);
  }

  /** Replaces the single organization row. Used by the seeder. */
  setOrganization(org: Organization): void {
    this.db.prepare("DELETE FROM organizations").run();
    this.db
      .prepare(
        `INSERT INTO organizations (slug, name, role, trialEndsAt, plan)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(org.slug, org.name, org.role, org.trialEndsAt, org.plan);
  }
}

function toPullRequest(r: Row): PullRequest {
  return {
    id: str(r.prId ?? r.id),
    repoId: str(r.repoId),
    number: num(r.number),
    title: str(r.title),
    author: str(r.author),
    url: str(r.url),
    headSha: str(r.headSha),
    state: str(r.state) as PullRequest["state"],
    isDraft: bool(r.isDraft),
    requestedReviewers: list(r.requestedReviewers),
    approvals: list(r.approvals),
    changesRequested: list(r.changesRequested),
    additions: num(r.additions),
    deletions: num(r.deletions),
    changedFiles: num(r.changedFiles),
    createdAt: num(r.createdAt),
    updatedAt: num(r.updatedAt),
    mergedAt: r.mergedAt === null ? null : num(r.mergedAt),
  };
}

const slug = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
