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
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { newId } from "./ids.js";
import { runSqliteMigrations } from "./migrate.js";
import { mergeSettings } from "./settings.js";

import type {
  AnswerInput,
  FindingInput,
  JudgmentInput,
  KomodoStore,
  PullRequestInput,
  QueueSnapshot,
  ReviewInput,
} from "./port.js";
import type {
  Answer,
  AIReviewJob,
  ApiKey,
  Finding,
  Integration,
  Judgment,
  JudgementVote,
  Member,
  MemoryFile,
  MemoryRule,
  MemoryRuleStats,
  Organization,
  OrgSettings,
  PullRequest,
  RepoCluster,
  Repository,
  Review,
  ReviewDetail,
  ReviewFile,
  ReviewJudgement,
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
  reviewCount INTEGER NOT NULL DEFAULT 0  -- legacy; derived at read time
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

CREATE TABLE IF NOT EXISTS ai_review_jobs (
  id             TEXT PRIMARY KEY,
  prId           TEXT NOT NULL REFERENCES pull_requests (id) ON DELETE CASCADE,
  headSha        TEXT NOT NULL,
  trigger        TEXT NOT NULL,
  state          TEXT NOT NULL,
  requestedBy    TEXT,
  requestedAt    INTEGER NOT NULL,
  updatedAt      INTEGER NOT NULL,
  workerId       TEXT,
  leaseExpiresAt INTEGER,
  lastError      TEXT
);
CREATE INDEX IF NOT EXISTS ai_review_jobs_ready
  ON ai_review_jobs (state, leaseExpiresAt, requestedAt);

CREATE TABLE IF NOT EXISTS judgments (
  id                TEXT PRIMARY KEY,
  prId              TEXT NOT NULL REFERENCES pull_requests (id) ON DELETE CASCADE,
  headSha           TEXT NOT NULL,
  verdict           TEXT,
  status            TEXT NOT NULL,
  impact            TEXT NOT NULL,
  score             REAL NOT NULL DEFAULT 0,
  createdAt         INTEGER NOT NULL,
  updatedAt         INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS judgments_pr_head ON judgments (prId, headSha);

CREATE TABLE IF NOT EXISTS findings (
  id         TEXT PRIMARY KEY,
  judgmentId TEXT NOT NULL REFERENCES judgments (id) ON DELETE CASCADE,
  ordinal    INTEGER NOT NULL DEFAULT 0,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  severity   TEXT NOT NULL,
  isSecurity INTEGER NOT NULL DEFAULT 0,
  -- status is a legacy column: it only ever held 'open', and the value the
  -- app reads is derived from the answer to judgementId at read time.
  status      TEXT NOT NULL DEFAULT 'open',
  filePath    TEXT NOT NULL,
  -- The judgement this finding summarises. Null for a run recorded before the
  -- link existed, which reads as 'open' exactly as it did then.
  judgementId TEXT,
  createdAt   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS findings_judgment ON findings (judgmentId);
CREATE INDEX IF NOT EXISTS findings_judgement ON findings (judgementId);

CREATE TABLE IF NOT EXISTS reviews (
  id          TEXT PRIMARY KEY,
  prId        TEXT NOT NULL REFERENCES pull_requests (id) ON DELETE CASCADE,
  headSha     TEXT NOT NULL,
  -- Insertion order. Two runs can land in the same millisecond, so createdAt
  -- alone cannot say which is newer; this can.
  seq         INTEGER NOT NULL,
  provider    TEXT NOT NULL,
  model       TEXT,
  summary     TEXT NOT NULL,
  walkthrough TEXT NOT NULL DEFAULT '[]',
  confidence  INTEGER NOT NULL DEFAULT 0,
  effort      INTEGER NOT NULL DEFAULT 1,
  verdictLine TEXT NOT NULL DEFAULT '',
  diagram     TEXT,
  recordId    TEXT NOT NULL DEFAULT '',
  -- Set when someone closes the review out and posts the outcome. Never
  -- written by saveReview, so re-running the same head does not forget it.
  receiptUrl      TEXT,
  receiptPostedAt INTEGER,
  createdAt   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS reviews_pr ON reviews (prId, seq DESC);

CREATE TABLE IF NOT EXISTS review_files (
  id        TEXT PRIMARY KEY,
  reviewId  TEXT NOT NULL REFERENCES reviews (id) ON DELETE CASCADE,
  path      TEXT NOT NULL,
  additions INTEGER NOT NULL DEFAULT 0,
  deletions INTEGER NOT NULL DEFAULT 0,
  status    TEXT NOT NULL,
  patch     TEXT
);
CREATE INDEX IF NOT EXISTS review_files_review ON review_files (reviewId);

CREATE TABLE IF NOT EXISTS review_judgements (
  id         TEXT PRIMARY KEY,
  reviewId   TEXT NOT NULL REFERENCES reviews (id) ON DELETE CASCADE,
  ordinal    INTEGER NOT NULL,
  path       TEXT NOT NULL,
  line       INTEGER NOT NULL,
  endLine    INTEGER,
  severity   TEXT NOT NULL,
  kind       TEXT NOT NULL,
  tag        TEXT NOT NULL,
  title      TEXT NOT NULL,
  lede       TEXT NOT NULL,
  detail     TEXT NOT NULL,
  ask        TEXT NOT NULL,
  sources    TEXT NOT NULL DEFAULT '[]',
  sourceNote TEXT NOT NULL DEFAULT '',
  code       TEXT NOT NULL DEFAULT '',
  options    TEXT NOT NULL DEFAULT '[]',
  suggestion TEXT,
  fixPrompt  TEXT NOT NULL DEFAULT '',
  postable   INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS review_judgements_review ON review_judgements (reviewId, ordinal);

-- Append-only: no UPDATE and no DELETE anywhere in this driver.
--
-- Deliberately without foreign keys. A re-run of the same head replaces that
-- run's judgement rows, and a cascade would take the answers with them — but
-- what a human decided is the artifact this product exists to keep, and it has
-- to outlive the bodies it was decided against.
CREATE TABLE IF NOT EXISTS answers (
  id          TEXT PRIMARY KEY,
  judgementId TEXT NOT NULL,
  reviewId    TEXT NOT NULL,
  actorLogin  TEXT NOT NULL,
  bucket      TEXT,
  optionLabel TEXT,
  note        TEXT,
  blocking    INTEGER NOT NULL DEFAULT 0,
  createdAt   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS answers_review ON answers (reviewId, createdAt);
CREATE INDEX IF NOT EXISTS answers_judgement ON answers (judgementId, createdAt);

-- Trackers Komodo can read an issue out of. One row per provider: a
-- deployment talks to one Linear workspace and one Jira site, and a second
-- set of credentials for the same provider would be ambiguous, not useful.
CREATE TABLE IF NOT EXISTS integrations (
  provider    TEXT PRIMARY KEY,
  token       TEXT NOT NULL,
  baseUrl     TEXT NOT NULL DEFAULT '',
  account     TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'connected',
  lastError   TEXT,
  connectedAt INTEGER NOT NULL
);

-- Keys for the HTTP API. The secret is never stored: only its SHA-256, so a
-- copy of this database is not a set of working credentials.
CREATE TABLE IF NOT EXISTS api_keys (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  keyHash    TEXT NOT NULL UNIQUE,
  prefix     TEXT NOT NULL,
  createdAt  INTEGER NOT NULL,
  lastUsedAt INTEGER
);
CREATE INDEX IF NOT EXISTS api_keys_hash ON api_keys (keyHash);

-- What this team has taught Komodo. A rule is a sentence someone wrote; a
-- file rule points at paths whose contents are read at review time.
CREATE TABLE IF NOT EXISTS memory_rules (
  id          TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  kind        TEXT NOT NULL,
  pattern     TEXT NOT NULL,
  repoId      TEXT,
  fileGlob    TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'active',
  createdAt   INTEGER NOT NULL,
  updatedAt   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS repo_clusters (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  createdAt INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS repo_cluster_members (
  clusterId TEXT NOT NULL REFERENCES repo_clusters (id) ON DELETE CASCADE,
  repoId    TEXT NOT NULL,
  PRIMARY KEY (clusterId, repoId)
);

-- One row per (rule, run) the rule was handed to. The usage figures on the
-- memory screens are counted from here rather than incremented on the rule.
CREATE TABLE IF NOT EXISTS memory_rule_uses (
  ruleId    TEXT NOT NULL,
  reviewId  TEXT NOT NULL,
  paths     TEXT NOT NULL DEFAULT '[]',
  createdAt INTEGER NOT NULL,
  PRIMARY KEY (ruleId, reviewId)
);
CREATE INDEX IF NOT EXISTS memory_rule_uses_rule ON memory_rule_uses (ruleId);

-- What people thought of a judgement, as opposed to what they decided about
-- the code. One row per (judgement, actor): voting again replaces, and the
-- counts on a queue row are derived from here so a vote cast and a vote
-- counted cannot drift apart.
CREATE TABLE IF NOT EXISTS judgement_votes (
  judgementId TEXT NOT NULL,
  actorLogin  TEXT NOT NULL,
  value       INTEGER NOT NULL,
  createdAt   INTEGER NOT NULL,
  PRIMARY KEY (judgementId, actorLogin),
  FOREIGN KEY (judgementId) REFERENCES review_judgements (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS judgement_votes_judgement ON judgement_votes (judgementId);

-- How this deployment reviews. One row, one JSON blob: the object is small,
-- always read and written whole, and a settings screen grows fields faster
-- than a schema wants to grow columns. Reads fold it over the defaults.
CREATE TABLE IF NOT EXISTS org_settings (
  id   TEXT PRIMARY KEY,
  json TEXT NOT NULL
);

-- Small facts about the deployment itself rather than about a review:
-- when the poller last completed a pass, and whatever joins it later.
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
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
    // SQLite will create the file but not the directory holding it, and the
    // default path is `.komodo/` — which does not exist on a first run.
    if (options.path !== ":memory:") {
      mkdirSync(dirname(options.path), { recursive: true });
    }
    this.db = new DatabaseSync(options.path);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec(SCHEMA);
    // SCHEMA is the current shape for a fresh file; the ledger carries an
    // older one forward. Both are idempotent, so the order is safe either way.
    runSqliteMigrations(this.db);
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
      settings: await this.loadSettings(),
      teams: this.readTeams(),
      members: this.readMembers(),
      repositories: this.readRepositories(),
      pullRequests: await this.listPullRequests(),
      aiReviewJobs: await this.listAIReviewJobs(),
      judgments: this.readJudgments(),
      findings: this.readFindings(),
      memoryRules: await this.listMemoryRules(),
      repoClusters: await this.listRepoClusters(),
      apiKeys: await this.listApiKeys(),
      integrations: await this.listIntegrations(),
    };
  }

  async listPullRequests(): Promise<PullRequest[]> {
    const rows = this.db
      .prepare("SELECT * FROM pull_requests ORDER BY updatedAt DESC")
      .all() as Row[];
    return rows.map(toPullRequest);
  }

  async listAIReviewJobs(): Promise<AIReviewJob[]> {
    const rows = this.db
      .prepare("SELECT * FROM ai_review_jobs ORDER BY requestedAt, id")
      .all() as Row[];
    return rows.map(toAIReviewJob);
  }

  async listPullRequestsNeedingReview(
    options: { reReview?: boolean } = {},
  ): Promise<PullRequest[]> {
    const reReview = options.reReview ?? true;
    // LEFT JOIN on the exact (prId, headSha) the PR is at now. A judgment for
    // an older head does not count, which is what makes a new push re-enter
    // the work list without any explicit invalidation.
    // Settled at this head means done with it: `completed` is a verdict and
    // `skipped` is a deliberate decision not to reach one. Both stay out of
    // the work list until the head moves or someone retriggers. `error` and
    // `usage_limit` are not settled — they come back next pass.
    //
    // Drafts are no longer excluded here. Whether to review one is a setting
    // (auto_review.drafts), and a WHERE clause is a place a setting can never
    // reach; `shouldReview` in ../ingest/src/review.ts makes that call now.
    const rows = this.db
      .prepare(
        `SELECT p.* FROM pull_requests p
         LEFT JOIN judgments j
           ON j.prId = p.id AND j.headSha = p.headSha
          AND j.status IN ('completed', 'skipped')
         WHERE p.state = 'open' AND j.id IS NULL
           AND (? OR NOT EXISTS (
             SELECT 1 FROM judgments d
             WHERE d.prId = p.id AND d.status = 'completed'
           ))
         ORDER BY p.updatedAt ASC`,
      )
      .all(flag(reReview)) as Row[];
    return rows.map(toPullRequest);
  }

  /* ── The review body ─────────────────────────────────────────────────── */

  async loadReview(reviewId: string): Promise<ReviewDetail | null> {
    const row = this.db
      .prepare("SELECT * FROM reviews WHERE id = ?")
      .get(reviewId) as Row | undefined;
    return row ? this.detailFor(toReview(row)) : null;
  }

  async loadLatestReview(prId: string): Promise<ReviewDetail | null> {
    const row = this.db
      .prepare(
        "SELECT * FROM reviews WHERE prId = ? ORDER BY seq DESC LIMIT 1",
      )
      .get(prId) as Row | undefined;
    return row ? this.detailFor(toReview(row)) : null;
  }

  async listReviewRuns(prId: string): Promise<Review[]> {
    const rows = this.db
      .prepare("SELECT * FROM reviews WHERE prId = ? ORDER BY seq DESC")
      .all(prId) as Row[];
    return rows.map(toReview);
  }

  async loadReviewFiles(reviewId: string): Promise<ReviewFile[]> {
    const rows = this.db
      .prepare("SELECT * FROM review_files WHERE reviewId = ? ORDER BY path")
      .all(reviewId) as Row[];
    return rows.map(toReviewFile);
  }

  async listAnswers(reviewId: string): Promise<Answer[]> {
    const rows = this.db
      .prepare(
        "SELECT * FROM answers WHERE reviewId = ? ORDER BY createdAt, id",
      )
      .all(reviewId) as Row[];
    return rows.map(toAnswer);
  }

  /* ── Deployment facts ───────────────────────────────────────────────── */

  async getMeta(key: string): Promise<string | null> {
    const row = this.db
      .prepare("SELECT value FROM meta WHERE key = ?")
      .get(key) as Row | undefined;
    return row ? str(row.value) : null;
  }

  async listVotes(reviewId: string): Promise<JudgementVote[]> {
    const rows = this.db
      .prepare(
        `SELECT v.* FROM judgement_votes v
         JOIN review_judgements q ON q.id = v.judgementId
         WHERE q.reviewId = ?
         ORDER BY v.createdAt`,
      )
      .all(reviewId) as Row[];
    return rows.map((r) => ({
      judgementId: str(r.judgementId),
      actorLogin: str(r.actorLogin),
      value: num(r.value) > 0 ? 1 : -1,
      createdAt: num(r.createdAt),
    }));
  }

  async recordVote(input: {
    judgementId: string;
    actorLogin: string;
    value: 1 | -1 | null;
  }): Promise<void> {
    if (input.value === null) {
      this.db
        .prepare(
          "DELETE FROM judgement_votes WHERE judgementId = ? AND actorLogin = ?",
        )
        .run(input.judgementId, input.actorLogin);
      return;
    }
    this.db
      .prepare(
        `INSERT INTO judgement_votes (judgementId, actorLogin, value, createdAt)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(judgementId, actorLogin)
         DO UPDATE SET value = excluded.value, createdAt = excluded.createdAt`,
      )
      .run(input.judgementId, input.actorLogin, input.value, Date.now());
  }

  /* ── Integrations ───────────────────────────────────────────────────── */

  async listIntegrations(): Promise<Integration[]> {
    const rows = this.db
      .prepare("SELECT * FROM integrations ORDER BY provider")
      .all() as Row[];
    // `token` is selected and then dropped rather than excluded in SQL,
    // because toIntegration is the one place that decides what leaves.
    return rows.map(toIntegration);
  }

  async loadIntegrationToken(
    provider: Integration["provider"],
  ): Promise<{ integration: Integration; token: string } | null> {
    const row = this.db
      .prepare("SELECT * FROM integrations WHERE provider = ?")
      .get(provider) as Row | undefined;
    if (!row) return null;
    return { integration: toIntegration(row), token: str(row.token) };
  }

  async saveIntegration(input: {
    provider: Integration["provider"];
    token: string;
    baseUrl?: string;
    account?: string;
  }): Promise<string> {
    this.db
      .prepare(
        `INSERT INTO integrations
           (provider, token, baseUrl, account, status, lastError, connectedAt)
         VALUES (?, ?, ?, ?, 'connected', NULL, ?)
         ON CONFLICT(provider) DO UPDATE SET
           token = excluded.token, baseUrl = excluded.baseUrl,
           account = excluded.account, status = 'connected',
           lastError = NULL, connectedAt = excluded.connectedAt`,
      )
      .run(
        input.provider, input.token, input.baseUrl ?? "",
        input.account ?? "", Date.now(),
      );
    return input.provider;
  }

  async disconnectIntegration(integrationId: string): Promise<void> {
    // The id IS the provider — one row per provider, by design.
    this.db.prepare("DELETE FROM integrations WHERE provider = ?").run(integrationId);
  }

  async setIntegrationError(
    provider: Integration["provider"],
    error: string | null,
  ): Promise<void> {
    this.db
      .prepare(
        "UPDATE integrations SET status = ?, lastError = ? WHERE provider = ?",
      )
      .run(error ? "error" : "connected", error, provider);
  }

  /* ── API keys ───────────────────────────────────────────────────────── */

  async listApiKeys(): Promise<ApiKey[]> {
    const rows = this.db
      .prepare("SELECT * FROM api_keys ORDER BY createdAt DESC")
      .all() as Row[];
    return rows.map(toApiKey);
  }

  async findApiKeyByHash(keyHash: string): Promise<ApiKey | null> {
    const row = this.db
      .prepare("SELECT * FROM api_keys WHERE keyHash = ?")
      .get(keyHash) as Row | undefined;
    if (!row) return null;

    // Recorded here rather than by the caller: every path that authenticates
    // goes through this one, and a lastUsedAt that depends on a caller
    // remembering to update it is a lastUsedAt nobody can trust.
    this.db
      .prepare("UPDATE api_keys SET lastUsedAt = ? WHERE id = ?")
      .run(Date.now(), str(row.id));
    return toApiKey(row);
  }

  async createApiKey(input: {
    name: string;
    keyHash: string;
    prefix: string;
  }): Promise<ApiKey> {
    const key: ApiKey = {
      id: newId("key"),
      name: input.name,
      prefix: input.prefix,
      createdAt: Date.now(),
      lastUsedAt: null,
    };
    this.db
      .prepare(
        `INSERT INTO api_keys (id, name, keyHash, prefix, createdAt, lastUsedAt)
         VALUES (?, ?, ?, ?, ?, NULL)`,
      )
      .run(key.id, key.name, input.keyHash, key.prefix, key.createdAt);
    return key;
  }

  async deleteApiKey(keyId: string): Promise<void> {
    this.db.prepare("DELETE FROM api_keys WHERE id = ?").run(keyId);
  }

  /* ── Custom context ─────────────────────────────────────────────────── */

  async listMemoryRules(): Promise<MemoryRuleStats[]> {
    // Every figure here is counted, not stored — the same rule the queue's
    // engagement numbers follow. `acceptanceRate` is the share of judgements
    // from runs this rule was given that someone agreed with rather than
    // handed on, which is the only honest reading available: a judgement does
    // not record which rule produced it.
    const month = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const rows = this.db
      .prepare(
        `SELECT m.*,
                (SELECT COUNT(*) FROM memory_rule_uses u WHERE u.ruleId = m.id)
                  AS usageCount,
                (SELECT COUNT(*) FROM memory_rule_uses u
                  WHERE u.ruleId = m.id AND u.createdAt >= ?) AS usesThisMonth,
                (SELECT COUNT(*) FROM memory_rule_uses u
                  JOIN judgement_votes v
                    ON v.judgementId IN (
                      SELECT q.id FROM review_judgements q
                      WHERE q.reviewId = u.reviewId
                    )
                  WHERE u.ruleId = m.id AND v.value > 0) AS upvotes,
                (SELECT COUNT(*) FROM memory_rule_uses u
                  JOIN judgement_votes v
                    ON v.judgementId IN (
                      SELECT q.id FROM review_judgements q
                      WHERE q.reviewId = u.reviewId
                    )
                  WHERE u.ruleId = m.id AND v.value < 0) AS downvotes,
                (SELECT COUNT(*) FROM memory_rule_uses u
                  JOIN answers a ON a.reviewId = u.reviewId
                  WHERE u.ruleId = m.id AND a.bucket IS NOT NULL) AS decided,
                (SELECT COUNT(*) FROM memory_rule_uses u
                  JOIN answers a ON a.reviewId = u.reviewId
                  WHERE u.ruleId = m.id AND a.bucket = 'Agreed') AS agreed
         FROM memory_rules m
         ORDER BY m.updatedAt DESC`,
      )
      .all(month) as Row[];

    // The knowledge base: which repository files each rule has actually
    // resolved to, and how often. Counted from the uses rather than re-matched
    // here, because only the ingester ever holds a checkout to match against.
    const filesByRule = new Map<string, Map<string, number>>();
    for (const row of this.db
      .prepare("SELECT ruleId, paths FROM memory_rule_uses")
      .all() as Row[]) {
      const ruleId = str(row.ruleId);
      let counts = filesByRule.get(ruleId);
      if (!counts) filesByRule.set(ruleId, (counts = new Map()));
      for (const path of list(row.paths)) {
        counts.set(path, (counts.get(path) ?? 0) + 1);
      }
    }

    return rows.map((r) => {
      const decided = num(r.decided);
      return {
        id: str(r.id),
        description: str(r.description),
        kind: str(r.kind) as MemoryRule["kind"],
        pattern: str(r.pattern),
        repoId: r.repoId === null ? null : str(r.repoId),
        fileGlob: str(r.fileGlob),
        status: str(r.status) as MemoryRule["status"],
        createdAt: num(r.createdAt),
        updatedAt: num(r.updatedAt),
        files: filesFrom(filesByRule.get(str(r.id))),
        usageCount: num(r.usageCount),
        usesThisMonth: num(r.usesThisMonth),
        acceptanceRate: decided === 0 ? null : num(r.agreed) / decided,
        upvotes: num(r.upvotes),
        downvotes: num(r.downvotes),
      };
    });
  }

  async saveMemoryRule(
    rule: Omit<MemoryRule, "id" | "createdAt" | "updatedAt"> & { id?: string },
  ): Promise<string> {
    const id = rule.id ?? newId("mem");
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO memory_rules
           (id, description, kind, pattern, repoId, fileGlob, status,
            createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           description = excluded.description, kind = excluded.kind,
           pattern = excluded.pattern, repoId = excluded.repoId,
           fileGlob = excluded.fileGlob, status = excluded.status,
           updatedAt = excluded.updatedAt`,
      )
      .run(
        id, rule.description, rule.kind, rule.pattern, rule.repoId,
        rule.fileGlob, rule.status, now, now,
      );
    return id;
  }

  async deleteMemoryRule(ruleId: string): Promise<void> {
    this.db.prepare("DELETE FROM memory_rules WHERE id = ?").run(ruleId);
    // No cascade: the uses table is deliberately unconstrained so deleting a
    // rule does not rewrite the history of reviews that were given it.
  }

  async listRepoClusters(): Promise<RepoCluster[]> {
    const clusters = this.db
      .prepare("SELECT * FROM repo_clusters ORDER BY name")
      .all() as Row[];
    const members = this.db
      .prepare("SELECT * FROM repo_cluster_members")
      .all() as Row[];
    return clusters.map((c) => ({
      id: str(c.id),
      name: str(c.name),
      memberRepoIds: members
        .filter((m) => m.clusterId === c.id)
        .map((m) => str(m.repoId)),
      createdAt: num(c.createdAt),
    }));
  }

  async saveRepoCluster(
    cluster: Omit<RepoCluster, "id" | "createdAt"> & { id?: string },
  ): Promise<string> {
    const id = cluster.id ?? newId("cluster");
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(
          `INSERT INTO repo_clusters (id, name, createdAt) VALUES (?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET name = excluded.name`,
        )
        .run(id, cluster.name, Date.now());
      // Replaced wholesale, like a team's roster: the membership sent is the
      // membership, not an addition to whatever was there.
      this.db
        .prepare("DELETE FROM repo_cluster_members WHERE clusterId = ?")
        .run(id);
      const insert = this.db.prepare(
        "INSERT INTO repo_cluster_members (clusterId, repoId) VALUES (?, ?)",
      );
      for (const repoId of cluster.memberRepoIds) insert.run(id, repoId);
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
    return id;
  }

  async deleteRepoCluster(clusterId: string): Promise<void> {
    this.db.prepare("DELETE FROM repo_clusters WHERE id = ?").run(clusterId);
  }

  async recordMemoryUse(
    reviewId: string,
    uses: { ruleId: string; paths?: string[] }[],
  ): Promise<void> {
    if (!uses.length) return;
    const now = Date.now();
    const insert = this.db.prepare(
      `INSERT INTO memory_rule_uses (ruleId, reviewId, paths, createdAt)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(ruleId, reviewId) DO UPDATE SET paths = excluded.paths`,
    );
    for (const use of uses) {
      insert.run(use.ruleId, reviewId, JSON.stringify(use.paths ?? []), now);
    }
  }

  async loadSettings(): Promise<OrgSettings> {
    const row = this.db
      .prepare("SELECT json FROM org_settings WHERE id = 'default'")
      .get() as Row | undefined;
    return mergeSettings(row ? JSON.parse(str(row.json)) : null);
  }

  async saveSettings(patch: Partial<OrgSettings>): Promise<void> {
    // Read-modify-write rather than a JSON merge in SQL: the two dialects
    // disagree about JSON functions, and the row is one small object read by
    // a handful of people. Both drivers doing the same thing is worth more
    // here than a round trip saved.
    const current = await this.loadSettings();
    const next = mergeSettings({ ...current, ...patch });
    this.db
      .prepare(
        `INSERT INTO org_settings (id, json) VALUES ('default', ?)
         ON CONFLICT(id) DO UPDATE SET json = excluded.json`,
      )
      .run(JSON.stringify(next));
  }

  async setMeta(key: string, value: string): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO meta (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
  }

  private detailFor(review: Review): ReviewDetail {
    const judgements = (
      this.db
        .prepare(
          "SELECT * FROM review_judgements WHERE reviewId = ? ORDER BY ordinal",
        )
        .all(review.id) as Row[]
    ).map(toReviewJudgement);

    // The ledger is append-only, so "the answer" is the newest row per
    // judgement. Reading them in order and overwriting leaves exactly that,
    // and a withdrawal (bucket null) correctly wins over the answer it undid.
    const newest = new Map<string, Answer>();
    for (const row of this.db
      .prepare("SELECT * FROM answers WHERE reviewId = ? ORDER BY createdAt, id")
      .all(review.id) as Row[]) {
      const answer = toAnswer(row);
      newest.set(answer.judgementId, answer);
    }

    const votes = (
      this.db
        .prepare(
          `SELECT v.* FROM judgement_votes v
           JOIN review_judgements q ON q.id = v.judgementId
           WHERE q.reviewId = ?
           ORDER BY v.createdAt`,
        )
        .all(review.id) as Row[]
    ).map((r) => ({
      judgementId: str(r.judgementId),
      actorLogin: str(r.actorLogin),
      value: (num(r.value) > 0 ? 1 : -1) as 1 | -1,
      createdAt: num(r.createdAt),
    }));

    return { review, judgements, answers: [...newest.values()], votes };
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
    // reviewCount is derived for the same reason the judgment counters are:
    // the column was only ever written by the seeder, so "12 reviews" on the
    // manage-repos screen was fiction on any real deployment.
    const rows = this.db
      .prepare(
        `SELECT r.*,
                (SELECT COUNT(*) FROM judgments j
                  JOIN pull_requests p ON p.id = j.prId
                  WHERE p.repoId = r.id AND j.status = 'completed')
                  AS reviewCount
         FROM repositories r
         ORDER BY r.owner, r.name`,
      )
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
    // Every engagement number here is DERIVED, not stored. They used to be
    // columns, and the only thing that ever wrote them was the seeder — so on
    // a real deployment the comment ratings, the addressed rate and the
    // leaderboards were permanently zero while looking, in dev, entirely
    // alive. AGENTS.md rule 4 already said analytics are computed at read
    // time; these were the exception that proved nobody was checking.
    //
    //   totalComments     — judgements in the pull request's newest run
    //   addressedComments — those whose newest ledger entry has a bucket
    //   upvotes/downvotes — votes cast on those judgements
    //   reviewCount       — runs recorded against the pull request
    const rows = this.db
      .prepare(
        `WITH latest AS (
           SELECT prId, id AS reviewId,
                  ROW_NUMBER() OVER (PARTITION BY prId ORDER BY seq DESC) AS rn
           FROM reviews
         ),
         newest_answer AS (
           SELECT judgementId, bucket,
                  ROW_NUMBER() OVER (
                    PARTITION BY judgementId ORDER BY createdAt DESC, id DESC
                  ) AS rn
           FROM answers
         )
         SELECT j.id AS judgmentId, j.verdict, j.status, j.impact, j.score,
                (SELECT COUNT(*) FROM reviews r WHERE r.prId = j.prId)
                  AS reviewCount,
                (SELECT COUNT(*) FROM review_judgements q
                  JOIN latest l ON l.reviewId = q.reviewId AND l.rn = 1
                  WHERE l.prId = j.prId) AS totalComments,
                (SELECT COUNT(*) FROM review_judgements q
                  JOIN latest l ON l.reviewId = q.reviewId AND l.rn = 1
                  JOIN newest_answer a ON a.judgementId = q.id AND a.rn = 1
                  WHERE l.prId = j.prId AND a.bucket IS NOT NULL
                    AND a.bucket <> 'Passed on')
                  AS addressedComments,
                (SELECT COUNT(*) FROM judgement_votes v
                  JOIN review_judgements q ON q.id = v.judgementId
                  JOIN latest l ON l.reviewId = q.reviewId AND l.rn = 1
                  WHERE l.prId = j.prId AND v.value > 0) AS upvotes,
                (SELECT COUNT(*) FROM judgement_votes v
                  JOIN review_judgements q ON q.id = v.judgementId
                  JOIN latest l ON l.reviewId = q.reviewId AND l.rn = 1
                  WHERE l.prId = j.prId AND v.value < 0) AS downvotes,
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
    // `status` is derived, not stored. It was a column that only ever held
    // 'open' — `replaceFindings` wrote that literal and nothing ever moved it
    // — so the dismissed and addressed states existed in the type and could
    // never occur. A finding is the queue's summary of a judgement, so it
    // takes its state from the answer that judgement got:
    //
    //   Passed on  → dismissed (someone looked and decided not to act)
    //   any other  → addressed (someone answered it)
    //   unanswered → open
    //
    // Linked by id rather than by title: a finding's index and its
    // judgement's ordinal do not line up — findings come from the postable
    // set, judgements from all of them sorted by severity — and joining on
    // the title text couples two independently-produced strings.
    const rows = this.db
      .prepare(
        `SELECT f.*,
                CASE
                  WHEN a.bucket = 'Passed on' THEN 'dismissed'
                  WHEN a.bucket IS NOT NULL   THEN 'addressed'
                  ELSE 'open'
                END AS status
         FROM findings f
         LEFT JOIN (
           SELECT judgementId, bucket,
                  ROW_NUMBER() OVER (
                    PARTITION BY judgementId ORDER BY createdAt DESC, id DESC
                  ) AS rn
           FROM answers
         ) a ON a.judgementId = f.judgementId AND a.rn = 1
         ORDER BY f.createdAt DESC, f.judgmentId, f.ordinal`,
      )
      .all() as Row[];
    return rows.map((r) => ({
      id: str(r.id),
      judgmentId: str(r.judgmentId),
      ordinal: num(r.ordinal),
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

  async requestAIReview(input: {
    prId: string;
    headSha: string;
    trigger: AIReviewJob["trigger"];
    requestedBy?: string | null;
    requestedAt: number;
  }): Promise<string> {
    const id = `${input.prId}@${input.headSha}`;
    this.db.prepare(
      `INSERT INTO ai_review_jobs
         (id, prId, headSha, trigger, state, requestedBy, requestedAt,
          updatedAt, workerId, leaseExpiresAt, lastError)
       VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, NULL, NULL, NULL)
       ON CONFLICT (id) DO UPDATE SET
         trigger = excluded.trigger,
         state = 'queued',
         requestedBy = excluded.requestedBy,
         requestedAt = excluded.requestedAt,
         updatedAt = excluded.updatedAt,
         workerId = NULL,
         leaseExpiresAt = NULL,
         lastError = NULL
       WHERE excluded.trigger IN ('manual', 'interactive')
         AND ai_review_jobs.state != 'running'`,
    ).run(
      id,
      input.prId,
      input.headSha,
      input.trigger,
      input.requestedBy ?? null,
      input.requestedAt,
      input.requestedAt,
    );
    return id;
  }

  async claimNextAIReview(input: {
    workerId: string;
    now: number;
    leaseMs: number;
  }): Promise<{ job: AIReviewJob; pr: PullRequest } | null> {
    const row = this.db.prepare(
      `UPDATE ai_review_jobs
       SET state = 'running', workerId = ?, leaseExpiresAt = ?, updatedAt = ?
       WHERE id = (
         SELECT id FROM ai_review_jobs
         WHERE state = 'queued'
            OR (state = 'running' AND leaseExpiresAt < ?)
         ORDER BY requestedAt, id
         LIMIT 1
       )
       RETURNING *`,
    ).get(
      input.workerId,
      input.now + input.leaseMs,
      input.now,
      input.now,
    ) as Row | undefined;
    if (!row) return null;
    const job = toAIReviewJob(row);
    const prRow = this.db
      .prepare("SELECT * FROM pull_requests WHERE id = ?")
      .get(job.prId) as Row | undefined;
    return prRow ? { job, pr: toPullRequest(prRow) } : null;
  }

  async finishAIReviewJob(input: {
    jobId: string;
    workerId: string;
    state: "completed" | "skipped" | "failed" | "cancelled";
    finishedAt: number;
    error?: string | null;
  }): Promise<boolean> {
    const result = this.db.prepare(
      `UPDATE ai_review_jobs
       SET state = ?, updatedAt = ?, lastError = ?, workerId = NULL,
           leaseExpiresAt = NULL
       WHERE id = ? AND state = 'running' AND workerId = ?`,
    ).run(
      input.state,
      input.finishedAt,
      input.error ?? null,
      input.jobId,
      input.workerId,
    ) as { changes: number };
    return result.changes === 1;
  }

  async upsertJudgment(input: JudgmentInput): Promise<string> {
    const id = `${input.prId}@${input.headSha}`;
    const now = Date.now();

    // The verdict and nothing else. Every engagement number a queue row shows
    // is counted at read time out of the rows that caused it — see
    // readJudgments — so there is nothing here to keep in step.
    this.db
      .prepare(
        `INSERT INTO judgments
           (id, prId, headSha, verdict, status, impact, score,
            createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           verdict = excluded.verdict, status = excluded.status,
           impact = excluded.impact, score = excluded.score,
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
           (id, judgmentId, ordinal, title, body, severity, isSecurity, status,
            filePath, judgementId, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
      );
      findings.forEach((f, i) => {
        insert.run(
          `${judgmentId}:${i}`, judgmentId, i, f.title, f.body, f.severity,
          flag(f.isSecurity), f.filePath, f.judgementId ?? null, now,
        );
      });
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  async saveReview(input: ReviewInput): Promise<string> {
    const id = `${input.prId}@${input.headSha}`;
    const now = Date.now();
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(
          // `seq` is not in the DO UPDATE list: a re-run of the same head
          // keeps the position it already had in the history.
          `INSERT INTO reviews
             (id, prId, headSha, seq, provider, model, summary, walkthrough,
              confidence, effort, verdictLine, diagram, recordId, createdAt)
           VALUES (?, ?, ?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM reviews),
                   ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET
             provider = excluded.provider, model = excluded.model,
             summary = excluded.summary, walkthrough = excluded.walkthrough,
             confidence = excluded.confidence, effort = excluded.effort,
             verdictLine = excluded.verdictLine, diagram = excluded.diagram,
             recordId = excluded.recordId`,
        )
        .run(
          id, input.prId, input.headSha, input.provider, input.model ?? null,
          input.summary, JSON.stringify(input.walkthrough),
          input.confidence, input.effort, input.verdictLine,
          input.diagram ?? null, input.recordId, now,
        );

      // A re-run of the same head replaces its own bodies. The answer rows
      // survive it: they reference judgement ids, which are ordinal-derived
      // and stable, and nothing here deletes from `answers`.
      this.db.prepare("DELETE FROM review_files WHERE reviewId = ?").run(id);
      const file = this.db.prepare(
        `INSERT INTO review_files (id, reviewId, path, additions, deletions, status, patch)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const f of input.files) {
        file.run(
          `${id}:${f.path}`, id, f.path, f.additions, f.deletions, f.status,
          f.patch ?? null,
        );
      }

      this.db.prepare("DELETE FROM review_judgements WHERE reviewId = ?").run(id);
      const judgement = this.db.prepare(
        `INSERT INTO review_judgements
           (id, reviewId, ordinal, path, line, endLine, severity, kind, tag,
            title, lede, detail, ask, sources, sourceNote, code, options,
            suggestion, fixPrompt, postable)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      input.judgements.forEach((j, ordinal) => {
        judgement.run(
          `${id}:${ordinal}`, id, ordinal, j.path, j.line, j.endLine ?? null,
          j.severity, j.kind, j.tag, j.title, j.lede, j.detail, j.ask,
          JSON.stringify(j.sources), j.sourceNote, j.code,
          JSON.stringify(j.options), j.suggestion ?? null, j.fixPrompt,
          flag(j.postable),
        );
      });
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
    return id;
  }

  async markReceiptPosted(reviewId: string, url: string): Promise<void> {
    this.db
      .prepare("UPDATE reviews SET receiptUrl = ?, receiptPostedAt = ? WHERE id = ?")
      .run(url, Date.now(), reviewId);
  }

  async recordAnswer(input: AnswerInput): Promise<void> {
    const now = Date.now();
    const reviewId = input.judgementId.replace(/:\d+$/, "");
    this.db
      .prepare(
        `INSERT INTO answers
           (id, judgementId, reviewId, actorLogin, bucket, optionLabel, note,
            blocking, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        // Two answers to the same judgement in the same millisecond would
        // collide on the primary key, so the row count disambiguates.
        `${input.judgementId}:${now}:${this.answerCount(input.judgementId)}`,
        input.judgementId, reviewId, input.actorLogin, input.bucket ?? null,
        input.optionLabel ?? null, input.note ?? null,
        flag(Boolean(input.blocking)), now,
      );
  }

  private answerCount(judgementId: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM answers WHERE judgementId = ?")
      .get(judgementId) as Row | undefined;
    return num(row?.n);
  }

  async setRepoEnabled(repoId: string, enabled: boolean): Promise<void> {
    this.db
      .prepare("UPDATE repositories SET enabled = ? WHERE id = ?")
      .run(flag(enabled), repoId);
  }

  async retriggerReviews(judgmentIds: string[]): Promise<void> {
    if (!judgmentIds.length) return;
    const holes = judgmentIds.map(() => "?").join(", ");
    const rows = this.db
      .prepare(`SELECT prId, headSha FROM judgments WHERE id IN (${holes})`)
      .all(...judgmentIds) as Row[];
    this.db
      .prepare(
        `UPDATE judgments SET status = 'pending', verdict = NULL, updatedAt = ?
         WHERE id IN (${holes})`,
      )
      .run(Date.now(), ...judgmentIds);
    const requestedAt = Date.now();
    for (const row of rows) {
      await this.requestAIReview({
        prId: str(row.prId),
        headSha: str(row.headSha),
        trigger: "manual",
        requestedAt,
      });
    }
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

  async setOrganization(org: Organization): Promise<void> {
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

function toAIReviewJob(r: Row): AIReviewJob {
  return {
    id: str(r.id),
    prId: str(r.prId),
    headSha: str(r.headSha),
    trigger: str(r.trigger) as AIReviewJob["trigger"],
    state: str(r.state) as AIReviewJob["state"],
    requestedBy: r.requestedBy == null ? null : str(r.requestedBy),
    requestedAt: num(r.requestedAt),
    updatedAt: num(r.updatedAt),
    workerId: r.workerId == null ? null : str(r.workerId),
    leaseExpiresAt: r.leaseExpiresAt == null ? null : num(r.leaseExpiresAt),
    lastError: r.lastError == null ? null : str(r.lastError),
  };
}

function toReview(r: Row): Review {
  return {
    id: str(r.id),
    prId: str(r.prId),
    headSha: str(r.headSha),
    provider: str(r.provider),
    model: r.model === null ? null : str(r.model),
    summary: str(r.summary),
    walkthrough: JSON.parse(String(r.walkthrough ?? "[]")) as Review["walkthrough"],
    confidence: num(r.confidence),
    effort: num(r.effort),
    verdictLine: str(r.verdictLine),
    diagram: r.diagram === null ? null : str(r.diagram),
    recordId: str(r.recordId),
    receiptUrl: r.receiptUrl == null ? null : str(r.receiptUrl),
    receiptPostedAt: r.receiptPostedAt == null ? null : num(r.receiptPostedAt),
    createdAt: num(r.createdAt),
  };
}

function toReviewFile(r: Row): ReviewFile {
  return {
    reviewId: str(r.reviewId),
    path: str(r.path),
    additions: num(r.additions),
    deletions: num(r.deletions),
    status: str(r.status),
    patch: r.patch === null ? null : str(r.patch),
  };
}

function toReviewJudgement(r: Row): ReviewJudgement {
  return {
    id: str(r.id),
    reviewId: str(r.reviewId),
    ordinal: num(r.ordinal),
    path: str(r.path),
    line: num(r.line),
    endLine: r.endLine === null ? null : num(r.endLine),
    severity: str(r.severity) as ReviewJudgement["severity"],
    kind: str(r.kind) as ReviewJudgement["kind"],
    tag: str(r.tag),
    title: str(r.title),
    lede: str(r.lede),
    detail: str(r.detail),
    ask: str(r.ask),
    sources: list(r.sources),
    sourceNote: str(r.sourceNote),
    code: str(r.code),
    options: JSON.parse(String(r.options ?? "[]")) as ReviewJudgement["options"],
    suggestion: r.suggestion === null ? null : str(r.suggestion),
    fixPrompt: str(r.fixPrompt),
    postable: bool(r.postable),
  };
}

function toAnswer(r: Row): Answer {
  return {
    id: str(r.id),
    judgementId: str(r.judgementId),
    reviewId: str(r.reviewId),
    actorLogin: str(r.actorLogin),
    bucket: r.bucket === null ? null : (str(r.bucket) as Answer["bucket"]),
    optionLabel: r.optionLabel === null ? null : str(r.optionLabel),
    note: r.note === null ? null : str(r.note),
    blocking: bool(r.blocking),
    createdAt: num(r.createdAt),
  };
}

const slug = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * A rule's resolved files, newest-heaviest first.
 *
 * Shared shape with the Postgres driver — the counting is identical and only
 * the query that feeds it differs.
 */
function filesFrom(counts: Map<string, number> | undefined): MemoryFile[] {
  if (!counts) return [];
  return [...counts.entries()]
    .map(([path, uses]) => ({ path, uses }))
    .sort((a, b) => b.uses - a.uses || a.path.localeCompare(b.path));
}

/** A key row, minus anything secret — the hash never leaves the driver. */
function toApiKey(r: Row): ApiKey {
  return {
    id: str(r.id),
    name: str(r.name),
    prefix: str(r.prefix),
    createdAt: num(r.createdAt),
    lastUsedAt: r.lastUsedAt == null ? null : num(r.lastUsedAt),
  };
}

/**
 * An integration row, minus the token.
 *
 * The single gate between a stored credential and everything that reads
 * integrations. `loadIntegrationToken` is the only way past it, and it exists
 * for exactly one caller.
 */
function toIntegration(r: Row): Integration {
  return {
    id: str(r.provider),
    provider: str(r.provider) as Integration["provider"],
    status: str(r.status) as Integration["status"],
    baseUrl: str(r.baseUrl),
    account: str(r.account),
    connectedAt: r.connectedAt == null ? null : num(r.connectedAt),
    lastError: r.lastError == null ? null : str(r.lastError),
  };
}
