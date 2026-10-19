import { DatabaseSync } from "node:sqlite";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  MIGRATIONS,
  runPostgresMigrations,
  runSqliteMigrations,
} from "../src/migrate.js";

/**
 * The one migration under test, named rather than positioned.
 *
 * This used to be `MIGRATIONS.slice(0, -1)` — every step but the last — which
 * silently stopped testing anything the moment a new migration was appended:
 * the target got marked as already applied and a later step ran in its place,
 * against a database shaped for this one. Marking everything *else* as applied
 * runs exactly one step, and keeps doing so however many are added after it.
 */
const TARGET = "012-verification-entry-order";
const previousMigrations = MIGRATIONS.filter((m) => m.id !== TARGET);

describe("verification entry order migration", () => {
  it("backfills SQLite entries and leaves the next sequence available", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(`CREATE TABLE schema_migrations (
        id TEXT PRIMARY KEY,
        appliedAt INTEGER NOT NULL
      );
      CREATE TABLE verification_entries (
        id TEXT PRIMARY KEY,
        requirementId TEXT NOT NULL,
        reviewId TEXT NOT NULL,
        createdAt INTEGER NOT NULL
      );
      INSERT INTO verification_entries VALUES
        ('entry-9', 'check', 'review', 100),
        ('entry-10', 'check', 'review', 100);`);
      const mark = db.prepare(
        "INSERT INTO schema_migrations (id, appliedAt) VALUES (?, 1)",
      );
      previousMigrations.forEach((migration) => mark.run(migration.id));

      runSqliteMigrations(db, 2);
      db.prepare(
        `INSERT INTO verification_entries
           (id, seq, requirementId, reviewId, createdAt)
         VALUES ('entry-new',
                 (SELECT COALESCE(MAX(seq), 0) + 1 FROM verification_entries),
                 'check', 'review', 100)`,
      ).run();

      // Asserted per entry, not as a sorted list of sequence numbers: the
      // backfill's whole job is to order by createdAt then id, and a set of
      // seqs sorted by seq is true whichever entry got which.
      expect(
        db.prepare("SELECT id, seq FROM verification_entries ORDER BY seq").all(),
      ).toEqual([
        { id: "entry-10", seq: 1 },
        { id: "entry-9", seq: 2 },
        { id: "entry-new", seq: 3 },
      ]);
    } finally {
      db.close();
    }
  });

  describe("Postgres", () => {
    // Booted once in a hook, not inside the test body, so the WASM startup
    // never has to fit inside the test's own default timeout.
    let db: PGlite;

    beforeAll(async () => {
      db = new PGlite();
      await db.waitReady;
    }, 30_000); // Same budget this file's test already had before the move from `it(...)` to this hook — not raised.

    afterAll(async () => {
      await db.close();
    });

    it("backfills Postgres entries and advances the sequence default", async () => {
      const sql = {
        async query<T>(text: string, params?: unknown[]) {
          const result = await db.query(text, params as never[]);
          return { rows: result.rows as T[] };
        },
        exec: async (text: string) => {
          await db.exec(text);
        },
      };

      await db.exec(`CREATE TABLE schema_migrations (
          id TEXT PRIMARY KEY,
          "appliedAt" BIGINT NOT NULL
        );
        CREATE TABLE verification_entries (
          id TEXT PRIMARY KEY,
          "requirementId" TEXT NOT NULL,
          "reviewId" TEXT NOT NULL,
          "createdAt" BIGINT NOT NULL
        );
        INSERT INTO verification_entries VALUES
          ('entry-9', 'check', 'review', 100),
          ('entry-10', 'check', 'review', 100);`);
      for (const migration of previousMigrations) {
        await db.query(
          `INSERT INTO schema_migrations (id, "appliedAt") VALUES ($1, 1)`,
          [migration.id],
        );
      }

      await runPostgresMigrations(sql, 2);
      await db.query(
        `INSERT INTO verification_entries
           (id, "requirementId", "reviewId", "createdAt")
         VALUES ('entry-new', 'check', 'review', 100)`,
      );

      const result = await db.query<{ seq: bigint }>(
        "SELECT seq FROM verification_entries ORDER BY seq",
      );
      expect(result.rows.map((row) => Number(row.seq))).toEqual([1, 2, 3]);
    });
  });
});
