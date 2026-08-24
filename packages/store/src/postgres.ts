/**
 * Postgres driver — what `komodo serve` runs on.
 *
 * A deliberate mirror of the SQLite driver rather than a clever abstraction
 * over it: the two dialects differ in placeholders, booleans and array
 * storage, and hiding that behind a query builder would cost more than the
 * duplication saves. What guarantees they agree is test/conformance.ts, which
 * both run unchanged.
 *
 * Ids are derived here for the same reason they are there — a pull request is
 * `${repoId}#${number}`, a judgment is `${prId}@${headSha}` — so idempotency
 * and restart safety fall out of the primary key.
 */
import type {
  AnswerInput,
  FindingInput,
  JudgmentInput,
  KomodoStore,
  PullRequestInput,
  QueueSnapshot,
  ReviewInput,
} from "./port.js";
import { newId } from "./ids.js";
import { runPostgresMigrations } from "./migrate.js";
import { mergeSettings } from "./settings.js";
import { fromPgPool, type SqlClient } from "./sql-client.js";
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
  "trialEndsAt" BIGINT NOT NULL,
  plan         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  name          TEXT NOT NULL,
  "githubLogin" TEXT NOT NULL UNIQUE,
  role          TEXT NOT NULL,
  "avatarSeed"  TEXT NOT NULL,
  "isYou"       BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS teams (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS repositories (
  id            TEXT PRIMARY KEY,
  owner         TEXT NOT NULL,
  name          TEXT NOT NULL,
  provider      TEXT NOT NULL,
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  "reviewCount" INTEGER NOT NULL DEFAULT 0,  -- legacy; derived at read time
  UNIQUE (owner, name)
);

CREATE TABLE IF NOT EXISTS team_members (
  "teamId"   TEXT NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  "memberId" TEXT NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  PRIMARY KEY ("teamId", "memberId")
);

CREATE TABLE IF NOT EXISTS team_repos (
  "teamId" TEXT NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  "repoId" TEXT NOT NULL REFERENCES repositories (id) ON DELETE CASCADE,
  PRIMARY KEY ("teamId", "repoId")
);

CREATE TABLE IF NOT EXISTS pull_requests (
  id                   TEXT PRIMARY KEY,
  "repoId"             TEXT NOT NULL REFERENCES repositories (id) ON DELETE CASCADE,
  number               INTEGER NOT NULL,
  title                TEXT NOT NULL,
  author               TEXT NOT NULL,
  url                  TEXT NOT NULL,
  "headSha"            TEXT NOT NULL,
  state                TEXT NOT NULL,
  "isDraft"            BOOLEAN NOT NULL DEFAULT FALSE,
  "requestedReviewers" JSONB NOT NULL DEFAULT '[]'::jsonb,
  approvals            JSONB NOT NULL DEFAULT '[]'::jsonb,
  "changesRequested"   JSONB NOT NULL DEFAULT '[]'::jsonb,
  additions            INTEGER NOT NULL DEFAULT 0,
  deletions            INTEGER NOT NULL DEFAULT 0,
  "changedFiles"       INTEGER NOT NULL DEFAULT 0,
  "createdAt"          BIGINT NOT NULL,
  "updatedAt"          BIGINT NOT NULL,
  "mergedAt"           BIGINT
);
CREATE INDEX IF NOT EXISTS pull_requests_repo ON pull_requests ("repoId");
CREATE INDEX IF NOT EXISTS pull_requests_updated ON pull_requests ("updatedAt");

CREATE TABLE IF NOT EXISTS ai_review_jobs (
  id               TEXT PRIMARY KEY,
  "prId"           TEXT NOT NULL REFERENCES pull_requests (id) ON DELETE CASCADE,
  "headSha"        TEXT NOT NULL,
  trigger          TEXT NOT NULL,
  state            TEXT NOT NULL,
  "requestedBy"    TEXT,
  "requestedAt"    BIGINT NOT NULL,
  "updatedAt"      BIGINT NOT NULL,
  "workerId"       TEXT,
  "leaseExpiresAt" BIGINT,
  "lastError"      TEXT
);
CREATE INDEX IF NOT EXISTS ai_review_jobs_ready
  ON ai_review_jobs (state, "leaseExpiresAt", "requestedAt");

CREATE TABLE IF NOT EXISTS judgments (
  id                  TEXT PRIMARY KEY,
  "prId"              TEXT NOT NULL REFERENCES pull_requests (id) ON DELETE CASCADE,
  "headSha"           TEXT NOT NULL,
  verdict             TEXT,
  status              TEXT NOT NULL,
  impact              TEXT NOT NULL,
  score               DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt"         BIGINT NOT NULL,
  "updatedAt"         BIGINT NOT NULL,
  UNIQUE ("prId", "headSha")
);

CREATE TABLE IF NOT EXISTS findings (
  id           TEXT PRIMARY KEY,
  "judgmentId" TEXT NOT NULL REFERENCES judgments (id) ON DELETE CASCADE,
  ordinal      INTEGER NOT NULL DEFAULT 0,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  severity     TEXT NOT NULL,
  "isSecurity" BOOLEAN NOT NULL DEFAULT FALSE,
  -- status is a legacy column: it only ever held 'open', and the value the
  -- app reads is derived from the answer to "judgementId" at read time.
  status        TEXT NOT NULL DEFAULT 'open',
  "filePath"    TEXT NOT NULL,
  -- The judgement this finding summarises. Null for a run recorded before the
  -- link existed, which reads as 'open' exactly as it did then.
  "judgementId" TEXT,
  "createdAt"   BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS findings_judgment ON findings ("judgmentId");
CREATE INDEX IF NOT EXISTS findings_judgement ON findings ("judgementId");

CREATE TABLE IF NOT EXISTS reviews (
  id            TEXT PRIMARY KEY,
  "prId"        TEXT NOT NULL REFERENCES pull_requests (id) ON DELETE CASCADE,
  "headSha"     TEXT NOT NULL,
  -- Insertion order. Two runs can land in the same millisecond, so createdAt
  -- alone cannot say which is newer; this can.
  seq           BIGINT NOT NULL,
  provider      TEXT NOT NULL,
  model         TEXT,
  summary       TEXT NOT NULL,
  walkthrough   JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence    INTEGER NOT NULL DEFAULT 0,
  effort        INTEGER NOT NULL DEFAULT 1,
  "verdictLine" TEXT NOT NULL DEFAULT '',
  diagram       TEXT,
  "recordId"    TEXT NOT NULL DEFAULT '',
  -- Set when someone closes the review out and posts the outcome. Never
  -- written by saveReview, so re-running the same head does not forget it.
  "receiptUrl"      TEXT,
  "receiptPostedAt" BIGINT,
  "createdAt"   BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS reviews_pr ON reviews ("prId", seq DESC);

-- CREATE TABLE IF NOT EXISTS leaves an existing table alone, so a database
-- written before these columns existed would never grow them. Postgres can
-- say "add it if it is missing" in one statement; sqlite.ts does the same
-- check by hand.
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS "receiptUrl" TEXT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS "receiptPostedAt" BIGINT;

CREATE TABLE IF NOT EXISTS review_files (
  id         TEXT PRIMARY KEY,
  "reviewId" TEXT NOT NULL REFERENCES reviews (id) ON DELETE CASCADE,
  path       TEXT NOT NULL,
  additions  INTEGER NOT NULL DEFAULT 0,
  deletions  INTEGER NOT NULL DEFAULT 0,
  status     TEXT NOT NULL,
  patch      TEXT
);
CREATE INDEX IF NOT EXISTS review_files_review ON review_files ("reviewId");

CREATE TABLE IF NOT EXISTS review_judgements (
  id           TEXT PRIMARY KEY,
  "reviewId"   TEXT NOT NULL REFERENCES reviews (id) ON DELETE CASCADE,
  ordinal      INTEGER NOT NULL,
  path         TEXT NOT NULL,
  line         INTEGER NOT NULL,
  "endLine"    INTEGER,
  severity     TEXT NOT NULL,
  kind         TEXT NOT NULL,
  tag          TEXT NOT NULL,
  title        TEXT NOT NULL,
  lede         TEXT NOT NULL,
  detail       TEXT NOT NULL,
  ask          TEXT NOT NULL,
  sources      JSONB NOT NULL DEFAULT '[]'::jsonb,
  "sourceNote" TEXT NOT NULL DEFAULT '',
  code         TEXT NOT NULL DEFAULT '',
  options      JSONB NOT NULL DEFAULT '[]'::jsonb,
  suggestion   TEXT,
  "fixPrompt"  TEXT NOT NULL DEFAULT '',
  postable     BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS review_judgements_review ON review_judgements ("reviewId", ordinal);

-- Append-only: no UPDATE and no DELETE anywhere in this driver.
--
-- Deliberately without foreign keys. A re-run of the same head replaces that
-- run's judgement rows, and a cascade would take the answers with them — but
-- what a human decided is the artifact this product exists to keep, and it has
-- to outlive the bodies it was decided against.
CREATE TABLE IF NOT EXISTS answers (
  id            TEXT PRIMARY KEY,
  "judgementId" TEXT NOT NULL,
  "reviewId"    TEXT NOT NULL,
  "actorLogin"  TEXT NOT NULL,
  bucket        TEXT,
  "optionLabel" TEXT,
  note          TEXT,
  blocking      BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt"   BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS answers_review ON answers ("reviewId", "createdAt");
CREATE INDEX IF NOT EXISTS answers_judgement ON answers ("judgementId", "createdAt");

-- Trackers Komodo can read an issue out of. One row per provider: a
-- deployment talks to one Linear workspace and one Jira site, and a second
-- set of credentials for the same provider would be ambiguous, not useful.
CREATE TABLE IF NOT EXISTS integrations (
  provider      TEXT PRIMARY KEY,
  token         TEXT NOT NULL,
  "baseUrl"     TEXT NOT NULL DEFAULT '',
  account       TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'connected',
  "lastError"   TEXT,
  "connectedAt" BIGINT NOT NULL
);

-- Keys for the HTTP API. The secret is never stored: only its SHA-256, so a
-- copy of this database is not a set of working credentials.
CREATE TABLE IF NOT EXISTS api_keys (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  "keyHash"    TEXT NOT NULL UNIQUE,
  prefix       TEXT NOT NULL,
  "createdAt"  BIGINT NOT NULL,
  "lastUsedAt" BIGINT
);
CREATE INDEX IF NOT EXISTS api_keys_hash ON api_keys ("keyHash");

-- What this team has taught Komodo. A rule is a sentence someone wrote; a
-- file rule points at paths whose contents are read at review time.
CREATE TABLE IF NOT EXISTS memory_rules (
  id          TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  kind        TEXT NOT NULL,
  pattern     TEXT NOT NULL,
  "repoId"    TEXT,
  "fileGlob"  TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'active',
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS repo_clusters (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  "createdAt" BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS repo_cluster_members (
  "clusterId" TEXT NOT NULL REFERENCES repo_clusters (id) ON DELETE CASCADE,
  "repoId"    TEXT NOT NULL,
  PRIMARY KEY ("clusterId", "repoId")
);

-- One row per (rule, run) the rule was handed to. The usage figures on the
-- memory screens are counted from here rather than incremented on the rule.
CREATE TABLE IF NOT EXISTS memory_rule_uses (
  "ruleId"    TEXT NOT NULL,
  "reviewId"  TEXT NOT NULL,
  paths       TEXT NOT NULL DEFAULT '[]',
  "createdAt" BIGINT NOT NULL,
  PRIMARY KEY ("ruleId", "reviewId")
);
CREATE INDEX IF NOT EXISTS memory_rule_uses_rule ON memory_rule_uses ("ruleId");

-- What people thought of a judgement, as opposed to what they decided about
-- the code. One row per (judgement, actor): voting again replaces, and the
-- counts on a queue row are derived from here so a vote cast and a vote
-- counted cannot drift apart.
CREATE TABLE IF NOT EXISTS judgement_votes (
  "judgementId" TEXT NOT NULL,
  "actorLogin"  TEXT NOT NULL,
  value         INTEGER NOT NULL,
  "createdAt"   BIGINT NOT NULL,
  PRIMARY KEY ("judgementId", "actorLogin"),
  FOREIGN KEY ("judgementId") REFERENCES review_judgements (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS judgement_votes_judgement ON judgement_votes ("judgementId");

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

/**
 * Pool options a connection string does not carry.
 *
 * TLS is the one that bites: every hosted Postgres — Railway, Neon, Supabase,
 * RDS — requires it, and `pg` does not infer that from the URL. Without this a
 * deployment fails at connect with a bare "connection terminated", which reads
 * like a network fault rather than a missing flag.
 *
 * `rejectUnauthorized: false` is deliberate and is the same posture
 * `sslmode=require` describes: these providers front Postgres with
 * certificates that do not chain to a public root, so verifying would reject
 * every real deployment. It protects the connection from eavesdropping, not
 * from a determined man in the middle. A deployment that needs the stronger
 * guarantee sets `sslmode=verify-full` in the URL, which `pg` honours and this
 * leaves alone.
 *
 * Localhost is exempt: a developer's own Postgres has no certificate at all,
 * and demanding one there would break the case this is least needed for.
 */
export function poolTuning(connectionString: string): Record<string, unknown> {
  let host = "";
  let explicitSsl = false;
  try {
    const url = new URL(connectionString);
    host = url.hostname;
    explicitSsl = url.searchParams.has("sslmode");
  } catch {
    // Not a URL `new URL` understands — leave every default alone rather than
    // guessing at a string the driver may still parse.
    return {};
  }

  const local = host === "localhost" || host === "127.0.0.1" || host === "::1";

  return {
    // A poller, a reviewer and a web server share this. Ten is generous for
    // three consumers and stays well under a small instance's limit.
    max: 10,
    idleTimeoutMillis: 30_000,
    // Fail a connection attempt rather than hanging the ingest pass on it.
    connectionTimeoutMillis: 10_000,
    ...(local || explicitSsl ? {} : { ssl: { rejectUnauthorized: false } }),
  };
}

const DEFAULT_ORG: Organization = {
  slug: "local",
  name: "Local",
  role: "admin",
  trialEndsAt: 0,
  plan: "pro",
};

type Row = Record<string, unknown>;

const str = (v: unknown): string => String(v ?? "");
/** BIGINT comes back as a string from pg — every timestamp needs coercing. */
const num = (v: unknown): number => Number(v ?? 0);
const bool = (v: unknown): boolean => v === true || v === "t" || v === 1;
const list = (v: unknown): string[] =>
  Array.isArray(v) ? (v as string[]) : JSON.parse(String(v ?? "[]"));

export class PostgresStore implements KomodoStore {
  private constructor(private readonly sql: SqlClient) {}

  /** Connects, creates the schema if absent, and hands back a ready store. */
  static async connect(connectionString: string): Promise<PostgresStore> {
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString,
      ...poolTuning(connectionString),
    });

    // `new Pool()` is lazy — it hands back a pool that has never opened a
    // socket, so a bad host or a refused password would first surface on some
    // page render minutes later. Connecting once here turns that into a
    // startup failure with the real error attached, which is where an
    // operator can actually act on it.
    const probe = await pool.connect();
    probe.release();

    return PostgresStore.fromClient(fromPgPool(pool));
  }

  /** Escape hatch for tests, which run this same driver against PGlite. */
  static async fromClient(sql: SqlClient): Promise<PostgresStore> {
    await sql.exec(SCHEMA);
    // SCHEMA stands a fresh database up; the ledger carries an older one
    // forward. Both are idempotent, so the order is safe either way.
    await runPostgresMigrations(sql);
    return new PostgresStore(sql);
  }

  close(): void {
    void this.sql.close();
  }

  /* ── Reads ──────────────────────────────────────────────────────────── */

  async snapshot(): Promise<QueueSnapshot> {
    const [
      organization,
      settings,
      teams,
      members,
      repositories,
      pullRequests,
      aiReviewJobs,
      judgments,
      findings,
      memoryRules,
      repoClusters,
      apiKeys,
      integrations,
    ] = await Promise.all([
      this.readOrganization(),
      this.loadSettings(),
      this.readTeams(),
      this.readMembers(),
      this.readRepositories(),
      this.listPullRequests(),
      this.listAIReviewJobs(),
      this.readJudgments(),
      this.readFindings(),
      this.listMemoryRules(),
      this.listRepoClusters(),
      this.listApiKeys(),
      this.listIntegrations(),
    ]);
    return {
      organization,
      settings,
      teams,
      members,
      repositories,
      pullRequests,
      aiReviewJobs,
      judgments,
      findings,
      memoryRules,
      repoClusters,
      apiKeys,
      integrations,
    };
  }

  async listPullRequests(): Promise<PullRequest[]> {
    const { rows } = await this.sql.query<Row>(
      `SELECT * FROM pull_requests ORDER BY "updatedAt" DESC`,
    );
    return rows.map(toPullRequest);
  }

  async listAIReviewJobs(): Promise<AIReviewJob[]> {
    const { rows } = await this.sql.query<Row>(
      `SELECT * FROM ai_review_jobs ORDER BY "requestedAt", id`,
    );
    return rows.map(toAIReviewJob);
  }

  async listPullRequestsNeedingReview(
    options: { reReview?: boolean } = {},
  ): Promise<PullRequest[]> {
    const reReview = options.reReview ?? true;
    // Settled at this head means done with it: `completed` is a verdict and
    // `skipped` is a deliberate decision not to reach one. Both stay out of
    // the work list until the head moves or someone retriggers. `error` and
    // `usage_limit` are not settled — they come back next pass.
    //
    // Drafts are no longer excluded here. Whether to review one is a setting
    // (auto_review.drafts), and a WHERE clause is a place a setting can never
    // reach; `shouldReview` in ../ingest/src/review.ts makes that call now.
    const { rows } = await this.sql.query<Row>(
      `SELECT p.* FROM pull_requests p
       LEFT JOIN judgments j
         ON j."prId" = p.id AND j."headSha" = p."headSha"
        AND j.status IN ('completed', 'skipped')
       WHERE p.state = 'open' AND j.id IS NULL
         AND ($1 OR NOT EXISTS (
           SELECT 1 FROM judgments d
           WHERE d."prId" = p.id AND d.status = 'completed'
         ))
       ORDER BY p."updatedAt" ASC`,
      [reReview],
    );
    return rows.map(toPullRequest);
  }

  /* ── The review body ─────────────────────────────────────────────────── */

  async loadReview(reviewId: string): Promise<ReviewDetail | null> {
    const { rows } = await this.sql.query<Row>(
      "SELECT * FROM reviews WHERE id = $1",
      [reviewId],
    );
    return rows[0] ? this.detailFor(toReview(rows[0])) : null;
  }

  async loadLatestReview(prId: string): Promise<ReviewDetail | null> {
    const { rows } = await this.sql.query<Row>(
      `SELECT * FROM reviews WHERE "prId" = $1 ORDER BY seq DESC LIMIT 1`,
      [prId],
    );
    return rows[0] ? this.detailFor(toReview(rows[0])) : null;
  }

  async listReviewRuns(prId: string): Promise<Review[]> {
    const { rows } = await this.sql.query<Row>(
      `SELECT * FROM reviews WHERE "prId" = $1 ORDER BY seq DESC`,
      [prId],
    );
    return rows.map(toReview);
  }

  async loadReviewFiles(reviewId: string): Promise<ReviewFile[]> {
    const { rows } = await this.sql.query<Row>(
      `SELECT * FROM review_files WHERE "reviewId" = $1 ORDER BY path`,
      [reviewId],
    );
    return rows.map(toReviewFile);
  }

  async listAnswers(reviewId: string): Promise<Answer[]> {
    const { rows } = await this.sql.query<Row>(
      `SELECT * FROM answers WHERE "reviewId" = $1 ORDER BY "createdAt", id`,
      [reviewId],
    );
    return rows.map(toAnswer);
  }

  /* ── Deployment facts ───────────────────────────────────────────────── */

  async getMeta(key: string): Promise<string | null> {
    const { rows } = await this.sql.query<Row>(
      "SELECT value FROM meta WHERE key = $1",
      [key],
    );
    return rows[0] ? str(rows[0].value) : null;
  }

  async listVotes(reviewId: string): Promise<JudgementVote[]> {
    const { rows } = await this.sql.query<Row>(
      `SELECT v.* FROM judgement_votes v
       JOIN review_judgements q ON q.id = v."judgementId"
       WHERE q."reviewId" = $1
       ORDER BY v."createdAt"`,
      [reviewId],
    );
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
      await this.sql.query(
        `DELETE FROM judgement_votes
         WHERE "judgementId" = $1 AND "actorLogin" = $2`,
        [input.judgementId, input.actorLogin],
      );
      return;
    }
    await this.sql.query(
      `INSERT INTO judgement_votes ("judgementId", "actorLogin", value, "createdAt")
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ("judgementId", "actorLogin")
       DO UPDATE SET value = EXCLUDED.value, "createdAt" = EXCLUDED."createdAt"`,
      [input.judgementId, input.actorLogin, input.value, Date.now()],
    );
  }

  /* ── Integrations ───────────────────────────────────────────────────── */

  async listIntegrations(): Promise<Integration[]> {
    const { rows } = await this.sql.query<Row>(
      "SELECT * FROM integrations ORDER BY provider",
    );
    // `token` is selected and then dropped rather than excluded in SQL,
    // because toIntegration is the one place that decides what leaves.
    return rows.map(toIntegration);
  }

  async loadIntegrationToken(
    provider: Integration["provider"],
  ): Promise<{ integration: Integration; token: string } | null> {
    const { rows } = await this.sql.query<Row>(
      "SELECT * FROM integrations WHERE provider = $1",
      [provider],
    );
    if (!rows[0]) return null;
    return { integration: toIntegration(rows[0]), token: str(rows[0].token) };
  }

  async saveIntegration(input: {
    provider: Integration["provider"];
    token: string;
    baseUrl?: string;
    account?: string;
  }): Promise<string> {
    await this.sql.query(
      `INSERT INTO integrations
         (provider, token, "baseUrl", account, status, "lastError", "connectedAt")
       VALUES ($1, $2, $3, $4, 'connected', NULL, $5)
       ON CONFLICT (provider) DO UPDATE SET
         token = EXCLUDED.token, "baseUrl" = EXCLUDED."baseUrl",
         account = EXCLUDED.account, status = 'connected',
         "lastError" = NULL, "connectedAt" = EXCLUDED."connectedAt"`,
      [
        input.provider, input.token, input.baseUrl ?? "",
        input.account ?? "", Date.now(),
      ],
    );
    return input.provider;
  }

  async disconnectIntegration(integrationId: string): Promise<void> {
    // The id IS the provider — one row per provider, by design.
    await this.sql.query("DELETE FROM integrations WHERE provider = $1", [
      integrationId,
    ]);
  }

  async setIntegrationError(
    provider: Integration["provider"],
    error: string | null,
  ): Promise<void> {
    await this.sql.query(
      `UPDATE integrations SET status = $1, "lastError" = $2 WHERE provider = $3`,
      [error ? "error" : "connected", error, provider],
    );
  }

  /* ── API keys ───────────────────────────────────────────────────────── */

  async listApiKeys(): Promise<ApiKey[]> {
    const { rows } = await this.sql.query<Row>(
      `SELECT * FROM api_keys ORDER BY "createdAt" DESC`,
    );
    return rows.map(toApiKey);
  }

  async findApiKeyByHash(keyHash: string): Promise<ApiKey | null> {
    const { rows } = await this.sql.query<Row>(
      `SELECT * FROM api_keys WHERE "keyHash" = $1`,
      [keyHash],
    );
    if (!rows[0]) return null;

    // Recorded here rather than by the caller: every path that authenticates
    // goes through this one, and a lastUsedAt that depends on a caller
    // remembering to update it is a lastUsedAt nobody can trust.
    await this.sql.query(
      `UPDATE api_keys SET "lastUsedAt" = $1 WHERE id = $2`,
      [Date.now(), str(rows[0].id)],
    );
    return toApiKey(rows[0]);
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
    await this.sql.query(
      `INSERT INTO api_keys
         (id, name, "keyHash", prefix, "createdAt", "lastUsedAt")
       VALUES ($1, $2, $3, $4, $5, NULL)`,
      [key.id, key.name, input.keyHash, key.prefix, key.createdAt],
    );
    return key;
  }

  async deleteApiKey(keyId: string): Promise<void> {
    await this.sql.query("DELETE FROM api_keys WHERE id = $1", [keyId]);
  }

  /* ── Custom context ─────────────────────────────────────────────────── */

  async listMemoryRules(): Promise<MemoryRuleStats[]> {
    // Every figure here is counted, not stored — the mirror of the SQLite
    // driver's query. `acceptanceRate` is the share of judgements from runs
    // this rule was given that someone agreed with rather than handed on.
    const month = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const { rows } = await this.sql.query<Row>(
      `SELECT m.*,
              (SELECT COUNT(*) FROM memory_rule_uses u WHERE u."ruleId" = m.id)
                AS "usageCount",
              (SELECT COUNT(*) FROM memory_rule_uses u
                WHERE u."ruleId" = m.id AND u."createdAt" >= $1)
                AS "usesThisMonth",
              (SELECT COUNT(*) FROM memory_rule_uses u
                JOIN judgement_votes v
                  ON v."judgementId" IN (
                    SELECT q.id FROM review_judgements q
                    WHERE q."reviewId" = u."reviewId"
                  )
                WHERE u."ruleId" = m.id AND v.value > 0) AS upvotes,
              (SELECT COUNT(*) FROM memory_rule_uses u
                JOIN judgement_votes v
                  ON v."judgementId" IN (
                    SELECT q.id FROM review_judgements q
                    WHERE q."reviewId" = u."reviewId"
                  )
                WHERE u."ruleId" = m.id AND v.value < 0) AS downvotes,
              (SELECT COUNT(*) FROM memory_rule_uses u
                JOIN answers a ON a."reviewId" = u."reviewId"
                WHERE u."ruleId" = m.id AND a.bucket IS NOT NULL) AS decided,
              (SELECT COUNT(*) FROM memory_rule_uses u
                JOIN answers a ON a."reviewId" = u."reviewId"
                WHERE u."ruleId" = m.id AND a.bucket = 'Agreed') AS agreed
       FROM memory_rules m
       ORDER BY m."updatedAt" DESC`,
      [month],
    );

    // The knowledge base: which repository files each rule has actually
    // resolved to, and how often. Counted from the uses rather than re-matched
    // here, because only the ingester ever holds a checkout to match against.
    const { rows: useRows } = await this.sql.query<Row>(
      `SELECT "ruleId", paths FROM memory_rule_uses`,
    );
    const filesByRule = new Map<string, Map<string, number>>();
    for (const row of useRows) {
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
        repoId: r.repoId === null || r.repoId === undefined ? null : str(r.repoId),
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
    await this.sql.query(
      `INSERT INTO memory_rules
         (id, description, kind, pattern, "repoId", "fileGlob", status,
          "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         description = EXCLUDED.description, kind = EXCLUDED.kind,
         pattern = EXCLUDED.pattern, "repoId" = EXCLUDED."repoId",
         "fileGlob" = EXCLUDED."fileGlob", status = EXCLUDED.status,
         "updatedAt" = EXCLUDED."updatedAt"`,
      [
        id, rule.description, rule.kind, rule.pattern, rule.repoId,
        rule.fileGlob, rule.status, now, now,
      ],
    );
    return id;
  }

  async deleteMemoryRule(ruleId: string): Promise<void> {
    await this.sql.query("DELETE FROM memory_rules WHERE id = $1", [ruleId]);
    // No cascade: the uses table is deliberately unconstrained so deleting a
    // rule does not rewrite the history of reviews that were given it.
  }

  async listRepoClusters(): Promise<RepoCluster[]> {
    const [clusters, members] = await Promise.all([
      this.sql.query<Row>("SELECT * FROM repo_clusters ORDER BY name"),
      this.sql.query<Row>("SELECT * FROM repo_cluster_members"),
    ]);
    return clusters.rows.map((c) => ({
      id: str(c.id),
      name: str(c.name),
      memberRepoIds: members.rows
        .filter((m) => m.clusterId === c.id)
        .map((m) => str(m.repoId)),
      createdAt: num(c.createdAt),
    }));
  }

  async saveRepoCluster(
    cluster: Omit<RepoCluster, "id" | "createdAt"> & { id?: string },
  ): Promise<string> {
    const id = cluster.id ?? newId("cluster");
    await this.transaction(async () => {
      await this.sql.query(
        `INSERT INTO repo_clusters (id, name, "createdAt") VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
        [id, cluster.name, Date.now()],
      );
      // Replaced wholesale, like a team's roster: the membership sent is the
      // membership, not an addition to whatever was there.
      await this.sql.query(
        `DELETE FROM repo_cluster_members WHERE "clusterId" = $1`,
        [id],
      );
      for (const repoId of cluster.memberRepoIds) {
        await this.sql.query(
          `INSERT INTO repo_cluster_members ("clusterId", "repoId")
           VALUES ($1, $2)`,
          [id, repoId],
        );
      }
    });
    return id;
  }

  async deleteRepoCluster(clusterId: string): Promise<void> {
    await this.sql.query("DELETE FROM repo_clusters WHERE id = $1", [clusterId]);
  }

  async recordMemoryUse(
    reviewId: string,
    uses: { ruleId: string; paths?: string[] }[],
  ): Promise<void> {
    if (!uses.length) return;
    const now = Date.now();
    for (const use of uses) {
      await this.sql.query(
        `INSERT INTO memory_rule_uses ("ruleId", "reviewId", paths, "createdAt")
         VALUES ($1, $2, $3, $4)
         ON CONFLICT ("ruleId", "reviewId")
         DO UPDATE SET paths = EXCLUDED.paths`,
        [use.ruleId, reviewId, JSON.stringify(use.paths ?? []), now],
      );
    }
  }

  async loadSettings(): Promise<OrgSettings> {
    const { rows } = await this.sql.query<Row>(
      "SELECT json FROM org_settings WHERE id = 'default'",
    );
    return mergeSettings(rows[0] ? JSON.parse(str(rows[0].json)) : null);
  }

  async saveSettings(patch: Partial<OrgSettings>): Promise<void> {
    // Read-modify-write rather than a JSON merge in SQL: the two dialects
    // disagree about JSON functions, and the row is one small object read by
    // a handful of people. Both drivers doing the same thing is worth more
    // here than a round trip saved.
    const current = await this.loadSettings();
    const next = mergeSettings({ ...current, ...patch });
    await this.sql.query(
      `INSERT INTO org_settings (id, json) VALUES ('default', $1)
       ON CONFLICT (id) DO UPDATE SET json = EXCLUDED.json`,
      [JSON.stringify(next)],
    );
  }

  async setMeta(key: string, value: string): Promise<void> {
    await this.sql.query(
      `INSERT INTO meta (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, value],
    );
  }

  private async detailFor(review: Review): Promise<ReviewDetail> {
    const [judgements, answers, votes] = await Promise.all([
      this.sql.query<Row>(
        `SELECT * FROM review_judgements WHERE "reviewId" = $1 ORDER BY ordinal`,
        [review.id],
      ),
      this.sql.query<Row>(
        `SELECT * FROM answers WHERE "reviewId" = $1 ORDER BY "createdAt", id`,
        [review.id],
      ),
      this.sql.query<Row>(
        `SELECT v.* FROM judgement_votes v
         JOIN review_judgements q ON q.id = v."judgementId"
         WHERE q."reviewId" = $1
         ORDER BY v."createdAt"`,
        [review.id],
      ),
    ]);

    // The ledger is append-only, so "the answer" is the newest row per
    // judgement — including a withdrawal, which correctly wins over the
    // answer it undid.
    const newest = new Map<string, Answer>();
    for (const row of answers.rows) {
      const answer = toAnswer(row);
      newest.set(answer.judgementId, answer);
    }

    return {
      review,
      judgements: judgements.rows.map(toReviewJudgement),
      answers: [...newest.values()],
      votes: votes.rows.map((r) => ({
        judgementId: str(r.judgementId),
        actorLogin: str(r.actorLogin),
        value: (num(r.value) > 0 ? 1 : -1) as 1 | -1,
        createdAt: num(r.createdAt),
      })),
    };
  }

  private async readOrganization(): Promise<Organization> {
    const { rows } = await this.sql.query<Row>(
      "SELECT * FROM organizations LIMIT 1",
    );
    const row = rows[0];
    if (!row) return DEFAULT_ORG;
    return {
      slug: str(row.slug),
      name: str(row.name),
      role: str(row.role) as Organization["role"],
      trialEndsAt: num(row.trialEndsAt),
      plan: str(row.plan) as Organization["plan"],
    };
  }

  private async readTeams(): Promise<Team[]> {
    const [teams, members, repos] = await Promise.all([
      this.sql.query<Row>("SELECT * FROM teams ORDER BY name"),
      this.sql.query<Row>("SELECT * FROM team_members"),
      this.sql.query<Row>("SELECT * FROM team_repos"),
    ]);
    return teams.rows.map((t) => ({
      id: str(t.id),
      name: str(t.name),
      memberIds: members.rows
        .filter((m) => m.teamId === t.id)
        .map((m) => str(m.memberId)),
      watchedRepoIds: repos.rows
        .filter((r) => r.teamId === t.id)
        .map((r) => str(r.repoId)),
    }));
  }

  private async readMembers(): Promise<Member[]> {
    const { rows } = await this.sql.query<Row>(
      "SELECT * FROM members ORDER BY name",
    );
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

  private async readRepositories(): Promise<Repository[]> {
    // Derived, like the judgment counters: the column was only ever written
    // by the seeder, so "12 reviews" on manage-repos was fiction in prod.
    const { rows } = await this.sql.query<Row>(
      `SELECT r.*,
              (SELECT COUNT(*) FROM judgments j
                JOIN pull_requests p ON p.id = j."prId"
                WHERE p."repoId" = r.id AND j.status = 'completed')
                AS "reviewCount"
       FROM repositories r
       ORDER BY r.owner, r.name`,
    );
    return rows.map((r) => ({
      id: str(r.id),
      owner: str(r.owner),
      name: str(r.name),
      provider: str(r.provider) as Repository["provider"],
      enabled: bool(r.enabled),
      reviewCount: num(r.reviewCount),
    }));
  }

  private async readJudgments(): Promise<Judgment[]> {
    // Every engagement number here is DERIVED, not stored — the mirror of the
    // SQLite driver's query, and for the same reason: these were columns only
    // the seeder ever wrote, so on a real deployment the comment ratings, the
    // addressed rate and the leaderboards were permanently zero.
    const { rows } = await this.sql.query<Row>(
      `WITH latest AS (
         SELECT "prId", id AS "reviewId",
                ROW_NUMBER() OVER (PARTITION BY "prId" ORDER BY seq DESC) AS rn
         FROM reviews
       ),
       newest_answer AS (
         SELECT "judgementId", bucket,
                ROW_NUMBER() OVER (
                  PARTITION BY "judgementId" ORDER BY "createdAt" DESC, id DESC
                ) AS rn
         FROM answers
       )
       SELECT j.id AS "judgmentId", j.verdict, j.status, j.impact, j.score,
              (SELECT COUNT(*) FROM reviews r WHERE r."prId" = j."prId")
                AS "reviewCount",
              (SELECT COUNT(*) FROM review_judgements q
                JOIN latest l ON l."reviewId" = q."reviewId" AND l.rn = 1
                WHERE l."prId" = j."prId") AS "totalComments",
              (SELECT COUNT(*) FROM review_judgements q
                JOIN latest l ON l."reviewId" = q."reviewId" AND l.rn = 1
                JOIN newest_answer a ON a."judgementId" = q.id AND a.rn = 1
                WHERE l."prId" = j."prId" AND a.bucket IS NOT NULL
                    AND a.bucket <> 'Passed on')
                AS "addressedComments",
              (SELECT COUNT(*) FROM judgement_votes v
                JOIN review_judgements q ON q.id = v."judgementId"
                JOIN latest l ON l."reviewId" = q."reviewId" AND l.rn = 1
                WHERE l."prId" = j."prId" AND v.value > 0) AS upvotes,
              (SELECT COUNT(*) FROM judgement_votes v
                JOIN review_judgements q ON q.id = v."judgementId"
                JOIN latest l ON l."reviewId" = q."reviewId" AND l.rn = 1
                WHERE l."prId" = j."prId" AND v.value < 0) AS downvotes,
              p.id AS "prId", p."repoId", p.number, p.title, p.author, p.url,
              p."headSha", p.state, p."isDraft", p."requestedReviewers",
              p.approvals, p."changesRequested", p.additions, p.deletions,
              p."changedFiles", p."createdAt", p."updatedAt", p."mergedAt"
       FROM judgments j
       JOIN pull_requests p ON p.id = j."prId"
       ORDER BY p."updatedAt" DESC`,
    );
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

  private async readFindings(): Promise<Finding[]> {
    // `status` is derived, not stored — the mirror of the SQLite driver's
    // query, and for the same reason: the column only ever held 'open', so
    // the dismissed and addressed states could never occur. A finding takes
    // its state from the answer its judgement got.
    const { rows } = await this.sql.query<Row>(
      `SELECT f.*,
              CASE
                WHEN a.bucket = 'Passed on' THEN 'dismissed'
                WHEN a.bucket IS NOT NULL   THEN 'addressed'
                ELSE 'open'
              END AS status
       FROM findings f
       LEFT JOIN (
         SELECT "judgementId", bucket,
                ROW_NUMBER() OVER (
                  PARTITION BY "judgementId" ORDER BY "createdAt" DESC, id DESC
                ) AS rn
         FROM answers
       ) a ON a."judgementId" = f."judgementId" AND a.rn = 1
       ORDER BY f."createdAt" DESC, f."judgmentId", f.ordinal`,
    );
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

  async setOrganization(org: Organization): Promise<void> {
    await this.sql.query("DELETE FROM organizations");
    await this.sql.query(
      `INSERT INTO organizations (slug, name, role, "trialEndsAt", plan)
       VALUES ($1, $2, $3, $4, $5)`,
      [org.slug, org.name, org.role, org.trialEndsAt, org.plan],
    );
  }

  async upsertRepository(
    repo: Omit<Repository, "id"> & { id?: string },
  ): Promise<string> {
    const id = repo.id ?? `${repo.owner}/${repo.name}`;
    await this.sql.query(
      `INSERT INTO repositories (id, owner, name, provider, enabled, "reviewCount")
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         owner = EXCLUDED.owner, name = EXCLUDED.name,
         provider = EXCLUDED.provider, enabled = EXCLUDED.enabled`,
      [id, repo.owner, repo.name, repo.provider, repo.enabled, repo.reviewCount],
    );
    return id;
  }

  async upsertPullRequest(pr: PullRequestInput): Promise<string> {
    const id = pr.id ?? `${pr.repoId}#${pr.number}`;
    await this.sql.query(
      `INSERT INTO pull_requests
         (id, "repoId", number, title, author, url, "headSha", state, "isDraft",
          "requestedReviewers", approvals, "changesRequested",
          additions, deletions, "changedFiles", "createdAt", "updatedAt", "mergedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title, author = EXCLUDED.author, url = EXCLUDED.url,
         "headSha" = EXCLUDED."headSha", state = EXCLUDED.state,
         "isDraft" = EXCLUDED."isDraft",
         "requestedReviewers" = EXCLUDED."requestedReviewers",
         approvals = EXCLUDED.approvals,
         "changesRequested" = EXCLUDED."changesRequested",
         additions = EXCLUDED.additions, deletions = EXCLUDED.deletions,
         "changedFiles" = EXCLUDED."changedFiles",
         "updatedAt" = EXCLUDED."updatedAt", "mergedAt" = EXCLUDED."mergedAt"`,
      [
        id, pr.repoId, pr.number, pr.title, pr.author, pr.url, pr.headSha,
        pr.state, pr.isDraft,
        JSON.stringify(pr.requestedReviewers),
        JSON.stringify(pr.approvals),
        JSON.stringify(pr.changesRequested),
        pr.additions, pr.deletions, pr.changedFiles,
        pr.createdAt, pr.updatedAt, pr.mergedAt,
      ],
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
    await this.sql.query(
      `INSERT INTO ai_review_jobs
         (id, "prId", "headSha", trigger, state, "requestedBy",
          "requestedAt", "updatedAt", "workerId", "leaseExpiresAt", "lastError")
       VALUES ($1,$2,$3,$4,'queued',$5,$6,$6,NULL,NULL,NULL)
       ON CONFLICT (id) DO UPDATE SET
         trigger = EXCLUDED.trigger,
         state = 'queued',
         "requestedBy" = EXCLUDED."requestedBy",
         "requestedAt" = EXCLUDED."requestedAt",
         "updatedAt" = EXCLUDED."updatedAt",
         "workerId" = NULL,
         "leaseExpiresAt" = NULL,
         "lastError" = NULL
       WHERE EXCLUDED.trigger IN ('manual', 'interactive')
         AND ai_review_jobs.state != 'running'`,
      [
        id,
        input.prId,
        input.headSha,
        input.trigger,
        input.requestedBy ?? null,
        input.requestedAt,
      ],
    );
    return id;
  }

  async claimNextAIReview(input: {
    workerId: string;
    now: number;
    leaseMs: number;
  }): Promise<{ job: AIReviewJob; pr: PullRequest } | null> {
    const { rows } = await this.sql.query<Row>(
      `UPDATE ai_review_jobs
       SET state = 'running', "workerId" = $1, "leaseExpiresAt" = $2,
           "updatedAt" = $3
       WHERE id = (
         SELECT id FROM ai_review_jobs
         WHERE state = 'queued'
            OR (state = 'running' AND "leaseExpiresAt" < $3)
         ORDER BY "requestedAt", id
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       RETURNING *`,
      [input.workerId, input.now + input.leaseMs, input.now],
    );
    if (!rows[0]) return null;
    const job = toAIReviewJob(rows[0]);
    const { rows: prRows } = await this.sql.query<Row>(
      `SELECT * FROM pull_requests WHERE id = $1`,
      [job.prId],
    );
    return prRows[0] ? { job, pr: toPullRequest(prRows[0]) } : null;
  }

  async finishAIReviewJob(input: {
    jobId: string;
    workerId: string;
    state: "completed" | "skipped" | "failed" | "cancelled";
    finishedAt: number;
    error?: string | null;
  }): Promise<boolean> {
    const { rows } = await this.sql.query<Row>(
      `UPDATE ai_review_jobs
       SET state = $1, "updatedAt" = $2, "lastError" = $3,
           "workerId" = NULL, "leaseExpiresAt" = NULL
       WHERE id = $4 AND state = 'running' AND "workerId" = $5
       RETURNING id`,
      [
        input.state,
        input.finishedAt,
        input.error ?? null,
        input.jobId,
        input.workerId,
      ],
    );
    return rows.length === 1;
  }

  async upsertJudgment(input: JudgmentInput): Promise<string> {
    const id = `${input.prId}@${input.headSha}`;
    const now = Date.now();

    // The verdict and nothing else. Every engagement number a queue row shows
    // is counted at read time out of the rows that caused it — see
    // readJudgments — so there is nothing here to keep in step.
    await this.sql.query(
      `INSERT INTO judgments
         (id, "prId", "headSha", verdict, status, impact, score,
          "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         verdict = EXCLUDED.verdict, status = EXCLUDED.status,
         impact = EXCLUDED.impact, score = EXCLUDED.score,
         "updatedAt" = EXCLUDED."updatedAt"`,
      [
        id, input.prId, input.headSha, input.verdict, input.status,
        input.impact, input.score, now, now,
      ],
    );
    return id;
  }

  async replaceFindings(
    judgmentId: string,
    findings: FindingInput[],
  ): Promise<void> {
    await this.transaction(async () => {
      await this.sql.query(`DELETE FROM findings WHERE "judgmentId" = $1`, [
        judgmentId,
      ]);
      const now = Date.now();
      for (const [i, f] of findings.entries()) {
        await this.sql.query(
          `INSERT INTO findings
             (id, "judgmentId", ordinal, title, body, severity, "isSecurity",
              status, "filePath", "judgementId", "createdAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,'open',$8,$9,$10)`,
          [
            `${judgmentId}:${i}`, judgmentId, i, f.title, f.body, f.severity,
            f.isSecurity, f.filePath, f.judgementId ?? null, now,
          ],
        );
      }
    });
  }

  async saveReview(input: ReviewInput): Promise<string> {
    const id = `${input.prId}@${input.headSha}`;
    const now = Date.now();
    await this.transaction(async () => {
      await this.sql.query(
        // `seq` is not in the DO UPDATE list: a re-run of the same head keeps
        // the position it already had in the history.
        `INSERT INTO reviews
           (id, "prId", "headSha", seq, provider, model, summary, walkthrough,
            confidence, effort, "verdictLine", diagram, "recordId", "createdAt")
         VALUES ($1,$2,$3,(SELECT COALESCE(MAX(seq), 0) + 1 FROM reviews),
                 $4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (id) DO UPDATE SET
           provider = EXCLUDED.provider, model = EXCLUDED.model,
           summary = EXCLUDED.summary, walkthrough = EXCLUDED.walkthrough,
           confidence = EXCLUDED.confidence, effort = EXCLUDED.effort,
           "verdictLine" = EXCLUDED."verdictLine", diagram = EXCLUDED.diagram,
           "recordId" = EXCLUDED."recordId"`,
        [
          id, input.prId, input.headSha, input.provider, input.model ?? null,
          input.summary, JSON.stringify(input.walkthrough),
          input.confidence, input.effort, input.verdictLine,
          input.diagram ?? null, input.recordId, now,
        ],
      );

      // A re-run of the same head replaces its own bodies. The answer rows
      // survive it: judgement ids are ordinal-derived and stable, and nothing
      // here deletes from `answers`.
      await this.sql.query(`DELETE FROM review_files WHERE "reviewId" = $1`, [id]);
      for (const f of input.files) {
        await this.sql.query(
          `INSERT INTO review_files
             (id, "reviewId", path, additions, deletions, status, patch)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            `${id}:${f.path}`, id, f.path, f.additions, f.deletions, f.status,
            f.patch ?? null,
          ],
        );
      }

      await this.sql.query(`DELETE FROM review_judgements WHERE "reviewId" = $1`, [id]);
      for (const [ordinal, j] of input.judgements.entries()) {
        await this.sql.query(
          `INSERT INTO review_judgements
             (id, "reviewId", ordinal, path, line, "endLine", severity, kind,
              tag, title, lede, detail, ask, sources, "sourceNote", code,
              options, suggestion, "fixPrompt", postable)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
          [
            `${id}:${ordinal}`, id, ordinal, j.path, j.line, j.endLine ?? null,
            j.severity, j.kind, j.tag, j.title, j.lede, j.detail, j.ask,
            JSON.stringify(j.sources), j.sourceNote, j.code,
            JSON.stringify(j.options), j.suggestion ?? null, j.fixPrompt,
            j.postable,
          ],
        );
      }
    });
    return id;
  }

  async markReceiptPosted(reviewId: string, url: string): Promise<void> {
    await this.sql.query(
      'UPDATE reviews SET "receiptUrl" = $1, "receiptPostedAt" = $2 WHERE id = $3',
      [url, Date.now(), reviewId],
    );
  }

  async recordAnswer(input: AnswerInput): Promise<void> {
    const now = Date.now();
    const reviewId = input.judgementId.replace(/:\d+$/, "");
    const { rows } = await this.sql.query<Row>(
      `SELECT COUNT(*) AS n FROM answers WHERE "judgementId" = $1`,
      [input.judgementId],
    );
    await this.sql.query(
      `INSERT INTO answers
         (id, "judgementId", "reviewId", "actorLogin", bucket, "optionLabel",
          note, blocking, "createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        // Two answers to the same judgement in the same millisecond would
        // collide on the primary key, so the row count disambiguates.
        `${input.judgementId}:${now}:${num(rows[0]?.n)}`,
        input.judgementId, reviewId, input.actorLogin, input.bucket ?? null,
        input.optionLabel ?? null, input.note ?? null,
        Boolean(input.blocking), now,
      ],
    );
  }

  async setRepoEnabled(repoId: string, enabled: boolean): Promise<void> {
    await this.sql.query(
      "UPDATE repositories SET enabled = $1 WHERE id = $2",
      [enabled, repoId],
    );
  }

  async retriggerReviews(judgmentIds: string[]): Promise<void> {
    if (!judgmentIds.length) return;
    const { rows } = await this.sql.query<Row>(
      `SELECT "prId", "headSha" FROM judgments WHERE id = ANY($1)`,
      [judgmentIds],
    );
    await this.sql.query(
      `UPDATE judgments SET status = 'pending', verdict = NULL, "updatedAt" = $1
       WHERE id = ANY($2)`,
      [Date.now(), judgmentIds],
    );
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
    await this.transaction(async () => {
      await this.sql.query(
        `INSERT INTO teams (id, name) VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
        [id, team.name],
      );
      await this.sql.query(`DELETE FROM team_members WHERE "teamId" = $1`, [id]);
      await this.sql.query(`DELETE FROM team_repos WHERE "teamId" = $1`, [id]);
      for (const memberId of team.memberIds) {
        await this.sql.query(
          `INSERT INTO team_members ("teamId", "memberId") VALUES ($1, $2)`,
          [id, memberId],
        );
      }
      for (const repoId of team.watchedRepoIds) {
        await this.sql.query(
          `INSERT INTO team_repos ("teamId", "repoId") VALUES ($1, $2)`,
          [id, repoId],
        );
      }
    });
    return id;
  }

  async deleteTeam(teamId: string): Promise<void> {
    await this.sql.query("DELETE FROM teams WHERE id = $1", [teamId]);
  }

  async saveMember(
    member: Omit<Member, "id"> & { id?: string },
  ): Promise<string> {
    const id = member.id ?? `member_${slug(member.githubLogin)}`;
    await this.sql.query(
      `INSERT INTO members (id, email, name, "githubLogin", role, "avatarSeed", "isYou")
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email, name = EXCLUDED.name,
         "githubLogin" = EXCLUDED."githubLogin", role = EXCLUDED.role,
         "avatarSeed" = EXCLUDED."avatarSeed", "isYou" = EXCLUDED."isYou"`,
      [
        id, member.email, member.name, member.githubLogin, member.role,
        member.avatarSeed, member.isYou,
      ],
    );
    return id;
  }

  async removeMember(memberId: string): Promise<void> {
    await this.sql.query("DELETE FROM members WHERE id = $1", [memberId]);
  }

  private async transaction(body: () => Promise<void>): Promise<void> {
    await this.sql.query("BEGIN");
    try {
      await body();
      await this.sql.query("COMMIT");
    } catch (err) {
      await this.sql.query("ROLLBACK");
      throw err;
    }
  }
}

/** JSONB comes back parsed from pg but as text from some clients. */
const json = <T,>(v: unknown, fallback: T): T =>
  v === null || v === undefined
    ? fallback
    : typeof v === "string"
      ? (JSON.parse(v) as T)
      : (v as T);

function toReview(r: Row): Review {
  return {
    id: str(r.id),
    prId: str(r.prId),
    headSha: str(r.headSha),
    provider: str(r.provider),
    model: r.model === null ? null : str(r.model),
    summary: str(r.summary),
    walkthrough: json<Review["walkthrough"]>(r.walkthrough, []),
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
    options: json<ReviewJudgement["options"]>(r.options, []),
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
    mergedAt: r.mergedAt === null || r.mergedAt === undefined ? null : num(r.mergedAt),
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

const slug = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * A rule's resolved files, heaviest first.
 *
 * The mirror of the SQLite driver's helper — the counting is identical and
 * only the query that feeds it differs.
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
