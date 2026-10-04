import { DatabaseSync } from "node:sqlite";

import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

import { MIGRATIONS, runPostgresMigrations, runSqliteMigrations } from "../src/migrate.js";

/** Named, not positioned — see verification-migration.test.ts for why. */
const TARGET = "016-review-depth";
const others = MIGRATIONS.filter((m) => m.id !== TARGET);

describe("review depth migration", () => {
  it("reads every existing SQLite run as one standard pass", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(`CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, appliedAt INTEGER NOT NULL);
        CREATE TABLE reviews (id TEXT PRIMARY KEY);
        CREATE TABLE ai_review_jobs (id TEXT PRIMARY KEY);
        INSERT INTO reviews VALUES ('r1');
        INSERT INTO ai_review_jobs VALUES ('j1');`);
      const mark = db.prepare("INSERT INTO schema_migrations (id, appliedAt) VALUES (?, 1)");
      others.forEach((m) => mark.run(m.id));

      runSqliteMigrations(db, 2);

      expect(db.prepare("SELECT depth, depthReason, passes, costUsd FROM reviews").get()).toEqual({
        depth: "standard", depthReason: "", passes: 1, costUsd: null,
      });
      expect(db.prepare("SELECT depth FROM ai_review_jobs").get()).toEqual({ depth: null });
    } finally {
      db.close();
    }
  });

  it("does the same on Postgres", async () => {
    const pg = new PGlite();
    try {
      const sql = {
        query: async <T,>(text: string, params?: unknown[]) => ({
          rows: (await pg.query(text, params as never[])).rows as T[],
        }),
        exec: async (text: string) => {
          await pg.exec(text);
        },
      };
      await pg.exec(`CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, "appliedAt" BIGINT NOT NULL);
        CREATE TABLE reviews (id TEXT PRIMARY KEY);
        CREATE TABLE ai_review_jobs (id TEXT PRIMARY KEY);
        INSERT INTO reviews VALUES ('r1');
        INSERT INTO ai_review_jobs VALUES ('j1');`);
      for (const m of others) {
        await pg.query(`INSERT INTO schema_migrations (id, "appliedAt") VALUES ($1, 1)`, [m.id]);
      }

      await runPostgresMigrations(sql, 2);

      const { rows } = await pg.query(`SELECT depth, "depthReason", passes, "costUsd" FROM reviews`);
      expect(rows[0]).toEqual({ depth: "standard", depthReason: "", passes: 1, costUsd: null });
      const jobs = await pg.query(`SELECT depth FROM ai_review_jobs`);
      expect(jobs.rows[0]).toEqual({ depth: null });
    } finally {
      await pg.close();
    }
  }, 30_000);
});
