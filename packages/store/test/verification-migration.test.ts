import { DatabaseSync } from "node:sqlite";

import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

import {
  MIGRATIONS,
  runPostgresMigrations,
  runSqliteMigrations,
} from "../src/migrate.js";

const previousMigrations = MIGRATIONS.slice(0, -1);

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

      expect(
        db.prepare("SELECT seq FROM verification_entries ORDER BY seq").all(),
      ).toEqual([{ seq: 1 }, { seq: 2 }, { seq: 3 }]);
    } finally {
      db.close();
    }
  });

  it("backfills Postgres entries and advances the sequence default", async () => {
    const db = new PGlite();
    const sql = {
      async query<T>(text: string, params?: unknown[]) {
        const result = await db.query(text, params as never[]);
        return { rows: result.rows as T[] };
      },
      exec: async (text: string) => {
        await db.exec(text);
      },
    };

    try {
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
    } finally {
      await db.close();
    }
  });
});
