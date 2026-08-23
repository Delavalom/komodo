import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

import { seedStore } from "../src/seed.js";
import { PostgresStore } from "../src/postgres.js";
import { SqliteStore } from "../src/sqlite.js";
import type { KomodoStore } from "../src/port.js";
import type { SqlClient } from "../src/sql-client.js";

/**
 * The seeder against both drivers.
 *
 * It used to run on SQLite alone, which left the largest write path in the
 * codebase — 184 pull requests, their reviews, answers and votes — never
 * executed against Postgres. Everything it writes goes through the port, so
 * "it works on SQLite" says nothing about the dialect `komodo serve` runs on:
 * a stray `excluded.` or an integer where a BIGINT belongs would surface on a
 * deployment rather than here.
 */
function fromPGlite(db: PGlite): SqlClient {
  return {
    async query<T>(text: string, params?: unknown[]) {
      const result = await db.query(text, params as never[]);
      return { rows: result.rows as T[] };
    },
    exec: async (text: string) => {
      await db.exec(text);
    },
    close: () => db.close(),
  };
}

const DRIVERS: { name: string; open: () => Promise<KomodoStore> }[] = [
  {
    name: "SqliteStore",
    open: async () => new SqliteStore({ path: ":memory:" }),
  },
  {
    name: "PostgresStore",
    open: () => PostgresStore.fromClient(fromPGlite(new PGlite())),
  },
];

describe.each(DRIVERS)("seedStore on $name", ({ open }) => {
  async function seeded() {
    const store = await open();
    await seedStore(store, { you: "Delavalom" });
    return store;
  }

  it("gives komodo dev a queue to render before any token is configured", async () => {
    const store = await seeded();
    const { judgments, repositories, members, teams } = await store.snapshot();

    expect(repositories.length).toBeGreaterThan(0);
    expect(judgments).toHaveLength(184);
    expect(teams).toHaveLength(1);
    expect(teams[0].memberIds).toHaveLength(members.length);
    expect([...teams[0].watchedRepoIds].sort()).toEqual(
      repositories.map((r) => r.id).sort(),
    );
    store.close();
  });

  it("leaves open pull requests waiting on a named reviewer", async () => {
    const store = await seeded();
    const { judgments } = await store.snapshot();

    const open = judgments.filter((j) => j.state === "open");
    expect(open.length).toBeGreaterThan(10);
    expect(open.every((j) => !j.requestedReviewers.includes(j.author))).toBe(true);
    expect(open.some((j) => j.requestedReviewers.length > 0)).toBe(true);
    store.close();
  });

  it("marks exactly one member as the signed-in user", async () => {
    const store = await seeded();
    const { members } = await store.snapshot();
    expect(members.filter((m) => m.isYou)).toHaveLength(1);
    expect(members.find((m) => m.isYou)?.githubLogin).toBe("Delavalom");
    store.close();
  });

  it("never lets a judgment disagree with its own score", async () => {
    const store = await seeded();
    const { judgments } = await store.snapshot();

    for (const j of judgments) {
      if (j.status !== "completed") expect(j.verdict).toBeNull();
      else if (j.score >= 5) expect(j.verdict).toBe("ship");
      else if (j.score < 2) expect(j.verdict).toBe("blocked");
    }
    store.close();
  });

  it("gives every completed judgment a review body to open", async () => {
    const store = await seeded();
    const { judgments } = await store.snapshot();
    const completed = judgments.filter((j) => j.status === "completed");
    expect(completed.length).toBeGreaterThan(0);

    for (const j of completed) {
      const detail = await store.loadReview(j.id);
      expect(detail, `no review body for ${j.id}`).not.toBeNull();
      expect(detail!.review.confidence).toBe(Math.round(j.score));
    }
    store.close();
  });

  it("asks a distinct question per judgement, with four ways to answer", async () => {
    const store = await seeded();
    const { judgments } = await store.snapshot();
    const withJudgements = [];

    for (const j of judgments.filter((x) => x.status === "completed")) {
      const detail = await store.loadReview(j.id);
      if (!detail?.judgements.length) continue;
      withJudgements.push(detail);

      const asks = detail.judgements.map((x) => x.ask);
      expect(new Set(asks).size).toBe(asks.length);
      for (const judgement of detail.judgements) {
        expect(judgement.options).toHaveLength(4);
        expect(judgement.options[2].bucket).toBe("Asked");
        expect(judgement.options[3].bucket).toBe("Passed on");
      }
    }

    expect(withJudgements.length).toBeGreaterThan(0);
    store.close();
  });

  it("keeps the findings table agreeing with the body it derives from", async () => {
    const store = await seeded();
    const { judgments, findings } = await store.snapshot();

    for (const j of judgments.filter((x) => x.status === "completed")) {
      const detail = await store.loadReview(j.id);
      const rows = findings.filter((f) => f.judgmentId === j.id);
      expect(rows).toHaveLength(detail!.judgements.length);
      expect(rows.map((f) => f.filePath)).toEqual(
        detail!.judgements.map((x) => x.path),
      );
    }
    store.close();
  });

  it("seeds judgements GitHub could not have anchored a comment to", async () => {
    const store = await seeded();
    const { judgments } = await store.snapshot();
    let unpostable = 0;

    for (const j of judgments.filter((x) => x.status === "completed")) {
      const detail = await store.loadReview(j.id);
      unpostable += detail!.judgements.filter((x) => !x.postable).length;
    }
    // The whole point of holding the body ourselves: these have nowhere to
    // render on GitHub, and the dev dataset should show some.
    expect(unpostable).toBeGreaterThan(0);
    store.close();
  });

  it("is idempotent — re-seeding updates in place rather than doubling", async () => {
    const store = new SqliteStore({ path: ":memory:" });
    await seedStore(store);
    await seedStore(store);

    const { judgments, repositories, members } = await store.snapshot();
    expect(judgments).toHaveLength(184);
    expect(repositories).toHaveLength(15);
    expect(members).toHaveLength(6);
    store.close();
  });
});
