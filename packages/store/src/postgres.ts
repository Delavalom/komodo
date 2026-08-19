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
  FindingInput,
  JudgmentInput,
  KomodoStore,
  PullRequestInput,
  QueueSnapshot,
} from "./port.js";
import { fromPgPool, type SqlClient } from "./sql-client.js";
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
  "reviewCount" INTEGER NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS judgments (
  id                  TEXT PRIMARY KEY,
  "prId"              TEXT NOT NULL REFERENCES pull_requests (id) ON DELETE CASCADE,
  "headSha"           TEXT NOT NULL,
  verdict             TEXT,
  status              TEXT NOT NULL,
  impact              TEXT NOT NULL,
  score               DOUBLE PRECISION NOT NULL DEFAULT 0,
  "reviewCount"       INTEGER NOT NULL DEFAULT 0,
  "addressedComments" INTEGER NOT NULL DEFAULT 0,
  "totalComments"     INTEGER NOT NULL DEFAULT 0,
  upvotes             INTEGER NOT NULL DEFAULT 0,
  downvotes           INTEGER NOT NULL DEFAULT 0,
  "createdAt"         BIGINT NOT NULL,
  "updatedAt"         BIGINT NOT NULL,
  UNIQUE ("prId", "headSha")
);

CREATE TABLE IF NOT EXISTS findings (
  id           TEXT PRIMARY KEY,
  "judgmentId" TEXT NOT NULL REFERENCES judgments (id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  severity     TEXT NOT NULL,
  "isSecurity" BOOLEAN NOT NULL DEFAULT FALSE,
  status       TEXT NOT NULL DEFAULT 'open',
  "filePath"   TEXT NOT NULL,
  "createdAt"  BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS findings_judgment ON findings ("judgmentId");
`;

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
    const pool = new Pool({ connectionString });
    return PostgresStore.fromClient(fromPgPool(pool));
  }

  /** Escape hatch for tests, which run this same driver against PGlite. */
  static async fromClient(sql: SqlClient): Promise<PostgresStore> {
    await sql.exec(SCHEMA);
    return new PostgresStore(sql);
  }

  close(): void {
    void this.sql.close();
  }

  /* ── Reads ──────────────────────────────────────────────────────────── */

  async snapshot(): Promise<QueueSnapshot> {
    const [organization, teams, members, repositories, judgments, findings] =
      await Promise.all([
        this.readOrganization(),
        this.readTeams(),
        this.readMembers(),
        this.readRepositories(),
        this.readJudgments(),
        this.readFindings(),
      ]);
    return { organization, teams, members, repositories, judgments, findings };
  }

  async listPullRequests(): Promise<PullRequest[]> {
    const { rows } = await this.sql.query<Row>(
      `SELECT * FROM pull_requests ORDER BY "updatedAt" DESC`,
    );
    return rows.map(toPullRequest);
  }

  async listPullRequestsNeedingReview(): Promise<PullRequest[]> {
    const { rows } = await this.sql.query<Row>(
      `SELECT p.* FROM pull_requests p
       LEFT JOIN judgments j
         ON j."prId" = p.id AND j."headSha" = p."headSha" AND j.status = 'completed'
       WHERE p.state = 'open' AND p."isDraft" = FALSE AND j.id IS NULL
       ORDER BY p."updatedAt" ASC`,
    );
    return rows.map(toPullRequest);
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
    const { rows } = await this.sql.query<Row>(
      "SELECT * FROM repositories ORDER BY owner, name",
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
    const { rows } = await this.sql.query<Row>(
      `SELECT j.id AS "judgmentId", j.verdict, j.status, j.impact, j.score,
              j."reviewCount", j."addressedComments", j."totalComments",
              j.upvotes, j.downvotes,
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
    const { rows } = await this.sql.query<Row>(
      `SELECT * FROM findings ORDER BY "createdAt" DESC`,
    );
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

  async upsertJudgment(input: JudgmentInput): Promise<string> {
    const id = `${input.prId}@${input.headSha}`;
    const now = Date.now();
    const c = input.counters;

    // Without counters this is the ingester's path: reviewCount owns itself,
    // so a re-review of the same head increments rather than resetting.
    await this.sql.query(
      `INSERT INTO judgments
         (id, "prId", "headSha", verdict, status, impact, score, "reviewCount",
          "addressedComments", "totalComments", upvotes, downvotes,
          "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (id) DO UPDATE SET
         verdict = EXCLUDED.verdict, status = EXCLUDED.status,
         impact = EXCLUDED.impact, score = EXCLUDED.score,
         "reviewCount" = CASE WHEN $15
           THEN EXCLUDED."reviewCount"
           ELSE judgments."reviewCount" + 1 END,
         "addressedComments" = EXCLUDED."addressedComments",
         "totalComments" = EXCLUDED."totalComments",
         upvotes = EXCLUDED.upvotes, downvotes = EXCLUDED.downvotes,
         "updatedAt" = EXCLUDED."updatedAt"`,
      [
        id, input.prId, input.headSha, input.verdict, input.status,
        input.impact, input.score,
        c?.reviewCount ?? 1,
        c?.addressedComments ?? 0, c?.totalComments ?? 0,
        c?.upvotes ?? 0, c?.downvotes ?? 0,
        now, now,
        Boolean(c),
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
             (id, "judgmentId", title, body, severity, "isSecurity", status,
              "filePath", "createdAt")
           VALUES ($1,$2,$3,$4,$5,$6,'open',$7,$8)`,
          [
            `${judgmentId}:${i}`, judgmentId, f.title, f.body, f.severity,
            f.isSecurity, f.filePath, now,
          ],
        );
      }
    });
  }

  async setRepoEnabled(repoId: string, enabled: boolean): Promise<void> {
    await this.sql.query(
      "UPDATE repositories SET enabled = $1 WHERE id = $2",
      [enabled, repoId],
    );
  }

  async retriggerReviews(judgmentIds: string[]): Promise<void> {
    if (!judgmentIds.length) return;
    await this.sql.query(
      `UPDATE judgments SET status = 'pending', verdict = NULL, "updatedAt" = $1
       WHERE id = ANY($2)`,
      [Date.now(), judgmentIds],
    );
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

const slug = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
