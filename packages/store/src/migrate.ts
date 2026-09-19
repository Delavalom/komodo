/**
 * Schema migrations.
 *
 * `CREATE TABLE IF NOT EXISTS` is enough to stand a fresh database up and
 * nothing more: it does not add a column to a table that already exists, so
 * every database written before a column shipped stays one column short and
 * dies on the first write that touches it. The SQLite driver used to paper
 * over exactly that with a hand-rolled `addMissingColumns`, and Postgres had
 * no equivalent at all.
 *
 * So: an ordered ledger. Each step runs once, in order, on both dialects, and
 * `schema_migrations` records which have been applied. The base SCHEMA in each
 * driver still creates the current shape for a fresh database — a migration
 * that has nothing to do there costs one introspection query and moves on.
 *
 * Migrations are append-only. Editing a step that has already shipped changes
 * nothing on a database that ran it, which makes the two disagree silently;
 * add a new step instead.
 */

/** One column to add when it is absent. */
export interface ColumnAddition {
  table: string;
  column: string;
  /** Type and constraints, per dialect — they differ on INTEGER vs BIGINT. */
  sqlite: string;
  postgres: string;
}

export interface Migration {
  /** Ordered and unique. Never reused, never renamed. */
  id: string;
  /**
   * Columns to add if they are not already there.
   *
   * Separate from `sql` because it is the one thing SQLite cannot say for
   * itself: Postgres has `ADD COLUMN IF NOT EXISTS` and SQLite does not, so
   * the runner checks first and both dialects take the same path.
   */
  addColumns?: ColumnAddition[];
  /** DDL identical on both dialects. Statements separated by `;`. */
  sql?: string;
  /** DDL only for SQLite. */
  sqlite?: string;
  /** DDL only for Postgres. */
  postgres?: string;
}

const SQLITE_INTEGRATIONS_DDL = `-- Trackers Komodo can read an issue out of. One row per provider: a
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
);`;

const POSTGRES_INTEGRATIONS_DDL = `-- Trackers Komodo can read an issue out of. One row per provider: a
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
);`;

const SQLITE_API_KEYS_DDL = `-- Keys for the HTTP API. The secret is never stored: only its SHA-256, so a
-- copy of this database is not a set of working credentials.
CREATE TABLE IF NOT EXISTS api_keys (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  keyHash    TEXT NOT NULL UNIQUE,
  prefix     TEXT NOT NULL,
  createdAt  INTEGER NOT NULL,
  lastUsedAt INTEGER
);
CREATE INDEX IF NOT EXISTS api_keys_hash ON api_keys (keyHash);`;

const POSTGRES_API_KEYS_DDL = `-- Keys for the HTTP API. The secret is never stored: only its SHA-256, so a
-- copy of this database is not a set of working credentials.
CREATE TABLE IF NOT EXISTS api_keys (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  "keyHash"    TEXT NOT NULL UNIQUE,
  prefix       TEXT NOT NULL,
  "createdAt"  BIGINT NOT NULL,
  "lastUsedAt" BIGINT
);
CREATE INDEX IF NOT EXISTS api_keys_hash ON api_keys ("keyHash");`;

const SQLITE_MEMORY_DDL = `-- What this team has taught Komodo. A rule is a sentence someone wrote; a
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
CREATE INDEX IF NOT EXISTS memory_rule_uses_rule ON memory_rule_uses (ruleId);`;

const POSTGRES_MEMORY_DDL = `-- What this team has taught Komodo. A rule is a sentence someone wrote; a
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
CREATE INDEX IF NOT EXISTS memory_rule_uses_rule ON memory_rule_uses ("ruleId");`;

/**
 * The ledger.
 *
 * 001 is the reconciliation the SQLite driver used to do inline. It is listed
 * here so a database from before the receipt columns shipped is carried
 * forward by the same machinery as everything after it.
 */
export const MIGRATIONS: Migration[] = [
  {
    id: "001-review-receipts",
    addColumns: [
      { table: "reviews", column: "receiptUrl", sqlite: "TEXT", postgres: "TEXT" },
      {
        table: "reviews",
        column: "receiptPostedAt",
        sqlite: "INTEGER",
        postgres: "BIGINT",
      },
    ],
  },
  {
    id: "002-meta",
    sql: `CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
)`,
  },
  {
    id: "003-org-settings",
    sql: `CREATE TABLE IF NOT EXISTS org_settings (
  id   TEXT PRIMARY KEY,
  json TEXT NOT NULL
)`,
  },
  {
    id: "004-judgement-votes",
    sqlite: `CREATE TABLE IF NOT EXISTS judgement_votes (
  judgementId TEXT NOT NULL,
  actorLogin  TEXT NOT NULL,
  value       INTEGER NOT NULL,
  createdAt   INTEGER NOT NULL,
  PRIMARY KEY (judgementId, actorLogin)
);
CREATE INDEX IF NOT EXISTS judgement_votes_judgement ON judgement_votes (judgementId)`,
    postgres: `CREATE TABLE IF NOT EXISTS judgement_votes (
  "judgementId" TEXT NOT NULL,
  "actorLogin"  TEXT NOT NULL,
  value         INTEGER NOT NULL,
  "createdAt"   BIGINT NOT NULL,
  PRIMARY KEY ("judgementId", "actorLogin")
);
CREATE INDEX IF NOT EXISTS judgement_votes_judgement ON judgement_votes ("judgementId")`,
  },
  {
    id: "005-finding-judgement-link",
    addColumns: [
      {
        table: "findings",
        column: "judgementId",
        sqlite: "TEXT",
        postgres: "TEXT",
      },
    ],
    sqlite:
      "CREATE INDEX IF NOT EXISTS findings_judgement ON findings (judgementId)",
    postgres:
      'CREATE INDEX IF NOT EXISTS findings_judgement ON findings ("judgementId")',
  },
  {
    id: "006-custom-context",
    sqlite: SQLITE_MEMORY_DDL,
    postgres: POSTGRES_MEMORY_DDL,
  },
  {
    id: "007-api-keys",
    sqlite: SQLITE_API_KEYS_DDL,
    postgres: POSTGRES_API_KEYS_DDL,
  },
  {
    id: "008-integrations",
    sqlite: SQLITE_INTEGRATIONS_DDL,
    postgres: POSTGRES_INTEGRATIONS_DDL,
  },
  {
    id: "009-finding-ordinal",
    addColumns: [
      {
        table: "findings",
        column: "ordinal",
        sqlite: "INTEGER NOT NULL DEFAULT 0",
        postgres: "INTEGER NOT NULL DEFAULT 0",
      },
    ],
  },
  {
    id: "010-ai-review-jobs",
    sqlite: `CREATE TABLE IF NOT EXISTS ai_review_jobs (
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
  ON ai_review_jobs (state, leaseExpiresAt, requestedAt)`,
    postgres: `CREATE TABLE IF NOT EXISTS ai_review_jobs (
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
  ON ai_review_jobs (state, "leaseExpiresAt", "requestedAt")`,
  },
  {
    id: "011-evidence-first-reviews",
    addColumns: [
      {
        table: "reviews",
        column: "version",
        sqlite: "INTEGER NOT NULL DEFAULT 2",
        postgres: "INTEGER NOT NULL DEFAULT 2",
      },
      {
        table: "review_judgements",
        column: "focus",
        sqlite: "TEXT NOT NULL DEFAULT 'code'",
        postgres: "TEXT NOT NULL DEFAULT 'code'",
      },
    ],
    sqlite: `CREATE TABLE IF NOT EXISTS verification_requirements (
  id             TEXT PRIMARY KEY,
  reviewId       TEXT NOT NULL REFERENCES reviews (id) ON DELETE CASCADE,
  ordinal        INTEGER NOT NULL,
  title          TEXT NOT NULL,
  instruction    TEXT NOT NULL,
  expectedResult TEXT NOT NULL,
  evidenceKinds  TEXT NOT NULL DEFAULT '[]',
  required       INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS verification_requirements_review
  ON verification_requirements (reviewId, ordinal);
CREATE TABLE IF NOT EXISTS verification_entries (
  id            TEXT PRIMARY KEY,
  requirementId TEXT NOT NULL,
  reviewId      TEXT NOT NULL REFERENCES reviews (id) ON DELETE CASCADE,
  actorLogin    TEXT NOT NULL,
  result        TEXT NOT NULL,
  evidenceKind  TEXT NOT NULL,
  evidenceUrl   TEXT,
  note          TEXT,
  createdAt     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS verification_entries_review
  ON verification_entries (reviewId, createdAt);
CREATE INDEX IF NOT EXISTS verification_entries_requirement
  ON verification_entries (requirementId, createdAt)`,
    postgres: `CREATE TABLE IF NOT EXISTS verification_requirements (
  id               TEXT PRIMARY KEY,
  "reviewId"       TEXT NOT NULL REFERENCES reviews (id) ON DELETE CASCADE,
  ordinal          INTEGER NOT NULL,
  title            TEXT NOT NULL,
  instruction      TEXT NOT NULL,
  "expectedResult" TEXT NOT NULL,
  "evidenceKinds"  JSONB NOT NULL DEFAULT '[]'::jsonb,
  required         BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS verification_requirements_review
  ON verification_requirements ("reviewId", ordinal);
CREATE TABLE IF NOT EXISTS verification_entries (
  id              TEXT PRIMARY KEY,
  "requirementId" TEXT NOT NULL,
  "reviewId"      TEXT NOT NULL REFERENCES reviews (id) ON DELETE CASCADE,
  "actorLogin"    TEXT NOT NULL,
  result          TEXT NOT NULL,
  "evidenceKind"  TEXT NOT NULL,
  "evidenceUrl"   TEXT,
  note            TEXT,
  "createdAt"     BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS verification_entries_review
  ON verification_entries ("reviewId", "createdAt");
CREATE INDEX IF NOT EXISTS verification_entries_requirement
  ON verification_entries ("requirementId", "createdAt")`,
  },
  {
    id: "012-verification-entry-order",
    addColumns: [
      {
        table: "verification_entries",
        column: "seq",
        sqlite: "INTEGER",
        postgres: "BIGINT",
      },
    ],
    sqlite: `WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY createdAt, id) AS n
  FROM verification_entries
)
UPDATE verification_entries
SET seq = (SELECT n FROM ranked WHERE ranked.id = verification_entries.id)
WHERE seq IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS verification_entries_seq_unique
  ON verification_entries (seq);
CREATE INDEX IF NOT EXISTS verification_entries_review_seq
  ON verification_entries (reviewId, seq);
CREATE INDEX IF NOT EXISTS verification_entries_requirement_seq
  ON verification_entries (requirementId, seq)`,
    postgres: `CREATE SEQUENCE IF NOT EXISTS verification_entries_order_seq;
ALTER TABLE verification_entries
  ALTER COLUMN seq SET DEFAULT nextval('verification_entries_order_seq');
UPDATE verification_entries
SET seq = nextval('verification_entries_order_seq')
WHERE seq IS NULL;
ALTER TABLE verification_entries ALTER COLUMN seq SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS verification_entries_seq_unique
  ON verification_entries (seq);
CREATE INDEX IF NOT EXISTS verification_entries_review_seq
  ON verification_entries ("reviewId", seq);
CREATE INDEX IF NOT EXISTS verification_entries_requirement_seq
  ON verification_entries ("requirementId", seq)`,
  },
  {
    id: "013-pull-request-checks",
    addColumns: [
      // Nullable throughout: a database that has never seen a rollup, and a
      // token that cannot read one, both have to be distinguishable from a
      // commit whose checks are genuinely all passing.
      { table: "pull_requests", column: "checksHeadSha", sqlite: "TEXT", postgres: "TEXT" },
      { table: "pull_requests", column: "checksState", sqlite: "TEXT", postgres: "TEXT" },
      { table: "pull_requests", column: "checksPassed", sqlite: "INTEGER", postgres: "INTEGER" },
      { table: "pull_requests", column: "checksPending", sqlite: "INTEGER", postgres: "INTEGER" },
      {
        table: "pull_requests",
        column: "checksFailing",
        sqlite: "TEXT NOT NULL DEFAULT '[]'",
        postgres: "JSONB NOT NULL DEFAULT '[]'::jsonb",
      },
      {
        table: "pull_requests",
        column: "checksObservedAt",
        sqlite: "INTEGER",
        postgres: "BIGINT",
      },
    ],
  },
  {
    id: "014-pull-request-conversations",
    sqlite: `-- When a pull request's conversation was last read from GitHub. A row
-- with no comments is the point: without it, an empty conversation is
-- indistinguishable from an unread one and gets re-fetched forever.
CREATE TABLE IF NOT EXISTS pr_conversations (
  prId       TEXT PRIMARY KEY REFERENCES pull_requests (id) ON DELETE CASCADE,
  observedAt INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pr_comments (
  id          TEXT PRIMARY KEY,
  prId        TEXT NOT NULL REFERENCES pull_requests (id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  externalId  INTEGER NOT NULL,
  inReplyToId INTEGER,
  author      TEXT NOT NULL,
  body        TEXT NOT NULL,
  path        TEXT,
  line        INTEGER,
  state       TEXT,
  url         TEXT NOT NULL,
  createdAt   INTEGER NOT NULL,
  updatedAt   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS pr_comments_pr ON pr_comments (prId, createdAt)`,
    postgres: `-- When a pull request's conversation was last read from GitHub. A row
-- with no comments is the point: without it, an empty conversation is
-- indistinguishable from an unread one and gets re-fetched forever.
CREATE TABLE IF NOT EXISTS pr_conversations (
  "prId"       TEXT PRIMARY KEY REFERENCES pull_requests (id) ON DELETE CASCADE,
  "observedAt" BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS pr_comments (
  id            TEXT PRIMARY KEY,
  "prId"        TEXT NOT NULL REFERENCES pull_requests (id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,
  "externalId"  BIGINT NOT NULL,
  "inReplyToId" BIGINT,
  author        TEXT NOT NULL,
  body          TEXT NOT NULL,
  path          TEXT,
  line          INTEGER,
  state         TEXT,
  url           TEXT NOT NULL,
  "createdAt"   BIGINT NOT NULL,
  "updatedAt"   BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS pr_comments_pr ON pr_comments ("prId", "createdAt")`,
  },
  {
    id: "015-member-github-identities",
    sqlite: `-- One roster member's own GitHub credential, so a review they submit from
-- Komodo is recorded by GitHub as theirs rather than as the deployment's.
-- The token leaves through loadGithubToken alone.
CREATE TABLE IF NOT EXISTS github_identities (
  memberId    TEXT PRIMARY KEY REFERENCES members (id) ON DELETE CASCADE,
  login       TEXT NOT NULL,
  token       TEXT NOT NULL,
  connectedAt INTEGER NOT NULL,
  lastError   TEXT
)`,
    postgres: `-- One roster member's own GitHub credential, so a review they submit from
-- Komodo is recorded by GitHub as theirs rather than as the deployment's.
-- The token leaves through loadGithubToken alone.
CREATE TABLE IF NOT EXISTS github_identities (
  "memberId"    TEXT PRIMARY KEY REFERENCES members (id) ON DELETE CASCADE,
  login         TEXT NOT NULL,
  token         TEXT NOT NULL,
  "connectedAt" BIGINT NOT NULL,
  "lastError"   TEXT
)`,
  },
];

/* ── Running them ────────────────────────────────────────────────────────── */

/**
 * Splits a DDL blob into statements.
 *
 * Line comments are stripped BEFORE the split, not after: a `--` comment is
 * free to contain a semicolon, and splitting first tears the sentence in half
 * and hands the tail to the database as SQL. That is not hypothetical — it is
 * how this function was first written, and the comment above the memory tables
 * is what caught it.
 */
function statements(sql: string): string[] {
  return sql
    .replace(/^\s*--.*$/gm, "")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** The slice of `node:sqlite`'s DatabaseSync the runner needs. */
export interface SyncDb {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): unknown;
  };
}

export function runSqliteMigrations(db: SyncDb, now: number = Date.now()): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       id TEXT PRIMARY KEY,
       appliedAt INTEGER NOT NULL
     )`,
  );
  const applied = new Set(
    db
      .prepare("SELECT id FROM schema_migrations")
      .all()
      .map((r) => String((r as Record<string, unknown>).id)),
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;

    for (const add of migration.addColumns ?? []) {
      const present = db
        .prepare(`SELECT name FROM pragma_table_info('${add.table}')`)
        .all()
        .map((r) => String((r as Record<string, unknown>).name));
      // A table the base schema has not created yet is a table this column
      // cannot belong to; the schema will ship it with the column already on.
      if (present.length === 0 || present.includes(add.column)) continue;
      db.exec(`ALTER TABLE ${add.table} ADD COLUMN ${add.column} ${add.sqlite}`);
    }

    for (const statement of statements(migration.sqlite ?? migration.sql ?? "")) {
      db.exec(statement);
    }

    db.prepare(
      "INSERT INTO schema_migrations (id, appliedAt) VALUES (?, ?)",
    ).run(migration.id, now);
  }
}

/** The slice of a Postgres client the runner needs — see ./sql-client.ts. */
export interface AsyncDb {
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
  exec(text: string): Promise<void>;
}

export async function runPostgresMigrations(
  sql: AsyncDb,
  now: number = Date.now(),
): Promise<void> {
  await sql.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       id TEXT PRIMARY KEY,
       "appliedAt" BIGINT NOT NULL
     )`,
  );
  const { rows } = await sql.query<{ id: string }>(
    "SELECT id FROM schema_migrations",
  );
  const applied = new Set(rows.map((r) => r.id));

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;

    for (const add of migration.addColumns ?? []) {
      // Postgres could do this with ADD COLUMN IF NOT EXISTS, but going
      // through the same introspection as SQLite keeps one code path.
      const { rows: cols } = await sql.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = $1`,
        [add.table],
      );
      if (cols.length === 0 || cols.some((c) => c.column_name === add.column)) {
        continue;
      }
      await sql.exec(
        `ALTER TABLE ${add.table} ADD COLUMN "${add.column}" ${add.postgres}`,
      );
    }

    for (const statement of statements(migration.postgres ?? migration.sql ?? "")) {
      await sql.exec(statement);
    }

    await sql.query(
      "INSERT INTO schema_migrations (id, \"appliedAt\") VALUES ($1, $2)",
      [migration.id, now],
    );
  }
}
