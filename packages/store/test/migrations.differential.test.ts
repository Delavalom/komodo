/**
 * SQLite and Postgres, migrating the same legacy database, side by side.
 *
 * `verification-migration.test.ts` and `depth-migration.test.ts` each prove
 * one migration backfills correctly, in isolation, against a hand-built
 * table shaped like the step before it ran. `diagram-legacy.test.ts` proves
 * a pre-JSON `diagram` column falls back to `null` instead of throwing. None
 * of the three compares the *two drivers* against each other on the same
 * legacy input — which is exactly the gap `conformance.ts` and
 * `differential.test.ts` leave for fresh writes: nothing before this file
 * proved `komodo dev`'s upgrade path and `komodo serve`'s upgrade path leave
 * a reviewer looking at the same history for the same pre-existing rows.
 *
 * This file reuses the same three legacy shapes, seeded identically on both
 * drivers through a real store (so every supporting table — organizations,
 * pull_requests, verification_requirements — exists, which the narrower
 * migration-only tests don't need), then:
 *
 *   1. drops the columns the migrations under test add (simulating a
 *      database that predates them) and un-marks those migrations,
 *   2. writes a legacy free-text `diagram` the way a pre-JSON row would
 *      have (diagram-legacy.test.ts's own fixture),
 *   3. runs `runSqliteMigrations` / `runPostgresMigrations` directly against
 *      the downgraded database (same shared-PGlite pattern `postgres.test.ts`
 *      introduced in K1 — one instance per file, reset by schema rather than
 *      rebooting PGlite's WASM),
 *   4. reads the result back through each driver's own store, and compares
 *      the two after `normalize()` strips what each driver mints for itself
 *      (generated ids) and anything the clock would make incidentally
 *      different (timestamps).
 *
 * The second describe block below is the reason this file exists: it found
 * a real divergence between the two drivers' backfill for migration
 * "012-verification-entry-order", pinned as a regression rather than fixed
 * here (see the BUG #1 comment).
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MIGRATIONS, runPostgresMigrations, runSqliteMigrations } from "../src/migrate.js";
import type { KomodoStore } from "../src/port.js";
import { PostgresStore } from "../src/postgres.js";
import type { SqlClient } from "../src/sql-client.js";
import { SqliteStore } from "../src/sqlite.js";
import type { AIReviewJob, Review, VerificationEntry } from "../src/types.js";
import { pr, review } from "./conformance.js";

/** A pre-JSON row — the exact fixture diagram-legacy.test.ts writes. */
const LEGACY_MERMAID = "sequenceDiagram\n  A->>B: pay()";

/** Timestamp passed to the migration runners themselves; never read back. */
const MIGRATION_APPLIED_AT = 1_700_000_050_000;

function fromPGlite(db: PGlite): SqlClient {
  return {
    async query<T>(text: string, params?: unknown[]) {
      const result = await db.query(text, params as never[]);
      return { rows: result.rows as T[] };
    },
    exec: async (text: string) => {
      await db.exec(text);
    },
    close: async () => {},
  };
}

/** Strips what each driver mints for itself (generated ids) and the clock
 * (both sides are seeded under the same frozen `Date.now()`, but the
 * migration path re-derives nothing from it — stripped anyway per the
 * standard differential contract rather than relying on that). */
function normalizeReview(r: Review) {
  const { id: _id, prId: _prId, headSha: _headSha, recordId: _recordId, createdAt: _createdAt, ...rest } = r;
  return rest;
}

function normalizeEntry(e: VerificationEntry) {
  const { id: _id, requirementId: _requirementId, reviewId: _reviewId, createdAt: _createdAt, ...rest } = e;
  return rest;
}

function normalizeJob(j: AIReviewJob) {
  const {
    id: _id,
    prId: _prId,
    headSha: _headSha,
    requestedAt: _requestedAt,
    updatedAt: _updatedAt,
    ...rest
  } = j;
  return rest;
}

describe("legacy reviews and jobs migrate to the same state on both drivers", () => {
  let dir: string;
  let sqlitePath: string;
  let pg: PGlite;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "komodo-migrations-differential-"));
    sqlitePath = join(dir, "db.sqlite");
    pg = new PGlite();
    await pg.waitReady;
  }, 30_000);

  afterEach(async () => {
    await pg.close();
    rmSync(dir, { recursive: true, force: true });
  });

  /**
   * Seeds a fresh, fully-migrated store with one PR, one review (two
   * verification requirements, same shapes conformance.ts's fixtures use),
   * one verification entry per requirement at distinct timestamps, and one
   * automatic (depth-less) AI review job — then downgrades the database to
   * look like it predates "012-verification-entry-order" and
   * "016-review-depth", and writes a legacy free-text diagram over the
   * review's `diagram` column. Returns the review id and the ids SqliteStore
   * and PostgresStore handed back, for both drivers to read back later.
   */
  async function seedLegacyWorld(makeStore: () => Promise<KomodoStore>, downgrade: () => Promise<void>) {
    const store = await makeStore();
    await store.upsertRepository({
      id: "acme/api", owner: "acme", name: "api", provider: "github", enabled: true, reviewCount: 0,
    });
    const prId = await store.upsertPullRequest(pr());

    const clock = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    let reviewId: string;
    let requirementIds: string[];
    try {
      reviewId = await store.saveReview(review({ prId }));
      requirementIds = (await store.loadReview(reviewId))!.verificationRequirements.map((r) => r.id);

      clock.mockReturnValue(1_700_000_001_000);
      await store.recordVerification({
        requirementId: requirementIds[0],
        actorLogin: "dev",
        result: "verified",
        evidenceKind: "preview",
      });

      clock.mockReturnValue(1_700_000_002_000);
      await store.recordVerification({
        requirementId: requirementIds[1],
        actorLogin: "ops",
        result: "failed",
        evidenceKind: "test_run",
      });

      clock.mockReturnValue(1_700_000_003_000);
      await store.requestAIReview({ prId, headSha: "aaa111", trigger: "new_pull_request", requestedAt: Date.now() });
    } finally {
      clock.mockRestore();
    }

    await store.close();
    await downgrade();
    return { reviewId };
  }

  it("agree on depth defaults, the diagram fallback and job depth after both migrations backfill", async () => {
    // Only "016-review-depth" is downgraded here, not "012" — on a *fresh*
    // database (what seedLegacyWorld builds through the real store), the
    // base SCHEMA already declares verification_entries.seq as an inline
    // `NOT NULL UNIQUE` column, backed by a SQLite auto-index
    // (`sqlite_autoindex_...`) that `DROP INDEX` cannot touch, so this
    // column can't be downgraded by dropping it from a freshly-seeded
    // table. A genuinely legacy database never had that inline constraint —
    // it only gets `seq` from migration 012's own `ALTER TABLE ADD COLUMN`
    // path, which is what the dedicated describe block below exercises
    // directly against a hand-built legacy table, the same way
    // verification-migration.test.ts does.
    //
    // ── SQLite ──────────────────────────────────────────────────────────
    const { reviewId: sqliteReviewId } = await seedLegacyWorld(
      async () => new SqliteStore({ path: sqlitePath }),
      async () => {
        const raw = new DatabaseSync(sqlitePath);
        try {
          raw.exec(`
            ALTER TABLE reviews DROP COLUMN depth;
            ALTER TABLE reviews DROP COLUMN depthReason;
            ALTER TABLE reviews DROP COLUMN passes;
            ALTER TABLE reviews DROP COLUMN costUsd;
            ALTER TABLE reviews DROP COLUMN savedAt;
            ALTER TABLE ai_review_jobs DROP COLUMN depth;
            DELETE FROM schema_migrations WHERE id = '016-review-depth';
          `);
          const reviewId = raw.prepare("SELECT id FROM reviews").get()!.id as string;
          raw.prepare("UPDATE reviews SET diagram = ? WHERE id = ?").run(LEGACY_MERMAID, reviewId);
          runSqliteMigrations(raw, MIGRATION_APPLIED_AT);
        } finally {
          raw.close();
        }
      },
    );

    const sqliteStore = new SqliteStore({ path: sqlitePath });
    const sqliteDetail = await sqliteStore.loadReview(sqliteReviewId);
    const sqliteEntries = await sqliteStore.listVerificationEntries(sqliteReviewId);
    const sqliteJobs = await sqliteStore.listAIReviewJobs();
    await sqliteStore.close();

    // ── Postgres (shared PGlite, K1's one-instance-per-file pattern) ────
    const sql = fromPGlite(pg);
    const { reviewId: pgReviewId } = await seedLegacyWorld(
      () => PostgresStore.fromClient(sql),
      async () => {
        await pg.exec(`
          ALTER TABLE reviews DROP COLUMN depth;
          ALTER TABLE reviews DROP COLUMN "depthReason";
          ALTER TABLE reviews DROP COLUMN passes;
          ALTER TABLE reviews DROP COLUMN "costUsd";
          ALTER TABLE reviews DROP COLUMN "savedAt";
          ALTER TABLE ai_review_jobs DROP COLUMN depth;
          DELETE FROM schema_migrations WHERE id = '016-review-depth';
        `);
        const { rows } = await pg.query<{ id: string }>("SELECT id FROM reviews");
        await pg.query(`UPDATE reviews SET diagram = $1 WHERE id = $2`, [LEGACY_MERMAID, rows[0].id]);
        await runPostgresMigrations(sql, MIGRATION_APPLIED_AT);
      },
    );

    const pgStore = await PostgresStore.fromClient(sql);
    const pgDetail = await pgStore.loadReview(pgReviewId);
    const pgEntries = await pgStore.listVerificationEntries(pgReviewId);
    const pgJobs = await pgStore.listAIReviewJobs();

    expect(pgDetail).not.toBeNull();
    expect(sqliteDetail).not.toBeNull();

    // The legacy free-text diagram falls back to null on both, through the
    // full migrate-then-read pipeline, not just a bare store (diagram-legacy
    // covers that half; this is the same guarantee after a real upgrade).
    expect(pgDetail!.review.diagram).toBeNull();
    expect(sqliteDetail!.review.diagram).toBeNull();

    // depth/depthReason/passes/costUsd backfill to the same defaults on
    // both drivers — migration 016's whole premise (migrate.ts:503: "a run
    // written before depth existed was one standard pass").
    expect(normalizeReview(pgDetail!.review)).toEqual(normalizeReview(sqliteDetail!.review));

    // Distinct createdAt per entry (no tie) — both drivers agree on order.
    expect(pgEntries.map(normalizeEntry)).toEqual(sqliteEntries.map(normalizeEntry));

    expect(pgJobs.map(normalizeJob)).toEqual(sqliteJobs.map(normalizeJob));
    expect(pgJobs[0].depth).toBeNull();
    expect(sqliteJobs[0].depth).toBeNull();
  });
});

describe("verification_entries seq backfill: migration 012-verification-entry-order", () => {
  /** Named, not positioned — see verification-migration.test.ts for why. */
  const TARGET = "012-verification-entry-order";
  const previousMigrations = MIGRATIONS.filter((m) => m.id !== TARGET);

  /** Three legacy rows sharing one createdAt, inserted in an order that is
   * the reverse of their id's sort order — the case a batch of evidence
   * recorded in the same request produces, and the hardest case for a
   * backfill that has to invent an order from nothing else. */
  const TIED_IDS = ["c", "b", "a"];

  it("agree when legacy createdAt values are distinct", () => {
    const sqlite = new DatabaseSync(":memory:");
    try {
      sqlite.exec(`CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, appliedAt INTEGER NOT NULL);
        CREATE TABLE verification_entries (id TEXT PRIMARY KEY, requirementId TEXT NOT NULL, reviewId TEXT NOT NULL, createdAt INTEGER NOT NULL);
        INSERT INTO verification_entries VALUES ('c', 'check', 'review', 100), ('b', 'check', 'review', 101), ('a', 'check', 'review', 102);`);
      const mark = sqlite.prepare("INSERT INTO schema_migrations (id, appliedAt) VALUES (?, 1)");
      previousMigrations.forEach((m) => mark.run(m.id));
      runSqliteMigrations(sqlite, 2);
      const sqliteOrder = sqlite.prepare("SELECT id FROM verification_entries ORDER BY seq").all().map((r) => (r as { id: string }).id);
      expect(sqliteOrder).toEqual(["c", "b", "a"]);
    } finally {
      sqlite.close();
    }
  });

  it("regression: diverge on a legacy createdAt tie (BUG #1, not fixed in this PR)", async () => {
    // SQLite backfills seq via ROW_NUMBER() OVER (ORDER BY createdAt, id) —
    // migrate.ts's own "012" step — so a tie breaks on id, ascending.
    const sqlite = new DatabaseSync(":memory:");
    let sqliteOrder: string[];
    try {
      sqlite.exec(`CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, appliedAt INTEGER NOT NULL);
        CREATE TABLE verification_entries (id TEXT PRIMARY KEY, requirementId TEXT NOT NULL, reviewId TEXT NOT NULL, createdAt INTEGER NOT NULL);`);
      const insert = sqlite.prepare("INSERT INTO verification_entries (id, requirementId, reviewId, createdAt) VALUES (?, 'check', 'review', 100)");
      for (const tiedId of TIED_IDS) insert.run(tiedId);
      const mark = sqlite.prepare("INSERT INTO schema_migrations (id, appliedAt) VALUES (?, 1)");
      previousMigrations.forEach((m) => mark.run(m.id));
      runSqliteMigrations(sqlite, 2);
      sqliteOrder = sqlite.prepare("SELECT id FROM verification_entries ORDER BY seq").all().map((r) => (r as { id: string }).id);
    } finally {
      sqlite.close();
    }

    // Postgres backfills seq via `nextval()` on an UPDATE with no ORDER BY —
    // migrate.ts's postgres "012" body — so a tie breaks on whatever scan
    // order Postgres updates the rows in, which for freshly-inserted rows is
    // insertion order, not id order.
    const pg = new PGlite();
    await pg.waitReady;
    let pgOrder: string[];
    try {
      await pg.exec(`CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, "appliedAt" BIGINT NOT NULL);
        CREATE TABLE verification_entries (id TEXT PRIMARY KEY, "requirementId" TEXT NOT NULL, "reviewId" TEXT NOT NULL, "createdAt" BIGINT NOT NULL);`);
      for (const tiedId of TIED_IDS) {
        await pg.query(
          `INSERT INTO verification_entries (id, "requirementId", "reviewId", "createdAt") VALUES ($1, 'check', 'review', 100)`,
          [tiedId],
        );
      }
      for (const m of previousMigrations) {
        await pg.query(`INSERT INTO schema_migrations (id, "appliedAt") VALUES ($1, 1)`, [m.id]);
      }
      await runPostgresMigrations({
        query: async <T,>(text: string, params?: unknown[]) => ({ rows: (await pg.query(text, params as never[])).rows as T[] }),
        exec: async (text: string) => {
          await pg.exec(text);
        },
      });
      const result = await pg.query<{ id: string }>("SELECT id FROM verification_entries ORDER BY seq");
      pgOrder = result.rows.map((r) => r.id);
    } finally {
      await pg.close();
    }

    // BUG #1: a legacy createdAt tie orders verification_entries
    // differently on `komodo dev` (SQLite) than on `komodo serve`
    // (Postgres) after the same upgrade — `listVerificationEntries`
    // (`ORDER BY seq`) would then show a reviewer a different evidence
    // history depending only on which deployment they opened. Not fixed
    // here: migrate.ts's own module doc says migrations are append-only
    // ("Editing a step that has already shipped changes nothing on a
    // database that ran it... add a new step instead"), so the fix is a new
    // migration that re-derives seq from (createdAt, id) on Postgres too —
    // out of scope for this test/CI-only PR (S7 stop condition 7a: a real
    // fix is a behavior change). Tracked for a follow-up, not-auto-merged
    // PR. TODO(#1): add a migration that reassigns seq by
    // ROW_NUMBER() OVER (ORDER BY "createdAt", id) on Postgres, matching
    // SQLite, and backfill it the same way 012 does today.
    expect(sqliteOrder).toEqual(["a", "b", "c"]);
    expect(pgOrder).toEqual(["c", "b", "a"]);
    expect(pgOrder).not.toEqual(sqliteOrder);
  });
});
