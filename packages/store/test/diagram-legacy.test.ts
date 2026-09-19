import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

import { SqliteStore } from "../src/sqlite.js";
import { PostgresStore } from "../src/postgres.js";
import type { PullRequestInput, ReviewInput } from "../src/port.js";

const T0 = 1_700_000_000_000;

function pr(over: Partial<PullRequestInput> = {}): PullRequestInput {
  return {
    repoId: "acme/api",
    number: 1,
    title: "Add rate limiting",
    author: "renata",
    url: "https://github.com/acme/api/pull/1",
    headSha: "aaa111",
    state: "open",
    isDraft: false,
    requestedReviewers: ["dev"],
    approvals: [],
    changesRequested: [],
    additions: 40,
    deletions: 3,
    changedFiles: 2,
    createdAt: T0,
    updatedAt: T0,
    mergedAt: null,
    ...over,
  };
}

/**
 * `diagram` used to hold free-text Mermaid source; it now holds JSON. A row
 * written before this change won't parse as JSON (or, if it coincidentally
 * does, won't validate against the spec schema) — this is the contract that
 * such a row loads as `diagram: null` instead of throwing. No backfill for
 * pre-change rows is planned; a diagram is supplementary content, not the
 * record of a decision.
 */
function reviewInput(overrides: Partial<ReviewInput> = {}): ReviewInput {
  return {
    version: 3,
    prId: "acme/api#1",
    headSha: "aaa111",
    provider: "claude",
    model: null,
    summary: "- No behaviour changed",
    walkthrough: [],
    confidence: 3,
    effort: 1,
    verdictLine: "Nothing here needs a decision.",
    recordId: "seed-1",
    files: [],
    judgements: [],
    verificationRequirements: [],
    ...overrides,
  };
}

describe("legacy raw-Mermaid diagram rows", () => {
  it("SQLite: falls back to null instead of throwing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "komodo-diagram-legacy-"));
    const path = join(dir, "db.sqlite");
    const store = new SqliteStore({ path });
    try {
      await store.upsertRepository({
        id: "acme/api",
        owner: "acme",
        name: "api",
        provider: "github",
        enabled: true,
        reviewCount: 0,
      });
      const prId = await store.upsertPullRequest(pr());
      const reviewId = await store.saveReview(reviewInput({ prId }));

      // A second raw connection to the same file simulates a row written by
      // the pre-change code path, which stored free-text Mermaid, not JSON.
      const raw = new DatabaseSync(path);
      raw.prepare("UPDATE reviews SET diagram = ? WHERE id = ?").run("sequenceDiagram\n  A->>B: pay()", reviewId);
      raw.close();

      const loaded = await store.loadReview(reviewId);
      expect(loaded?.review.diagram).toBeNull();
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("Postgres: falls back to null instead of throwing", async () => {
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
    const store = await PostgresStore.fromClient(sql as never);
    try {
      await store.upsertRepository({
        id: "acme/api",
        owner: "acme",
        name: "api",
        provider: "github",
        enabled: true,
        reviewCount: 0,
      });
      const prId = await store.upsertPullRequest(pr());
      const reviewId = await store.saveReview(reviewInput({ prId }));

      await sql.query(`UPDATE reviews SET diagram = $1 WHERE id = $2`, [
        "sequenceDiagram\n  A->>B: pay()",
        reviewId,
      ]);

      const loaded = await store.loadReview(reviewId);
      expect(loaded?.review.diagram).toBeNull();
    } finally {
      await db.close();
    }
  });
});
