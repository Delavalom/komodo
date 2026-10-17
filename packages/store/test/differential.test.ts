/**
 * SQLite and Postgres, side by side, on writes nobody picked.
 *
 * conformance.ts proves each driver passes the cases someone wrote down. This
 * proves the two agree with each other on cases fast-check makes up: random
 * sequences of answers, withdrawals, votes and verification evidence, applied
 * to both, then every read a screen derives from them compared. Any
 * difference is either a driver bug or a behaviour `komodo dev` and `komodo
 * serve` would show differently — AGENTS.md rule 1's failure, found before a
 * user finds it.
 *
 * A plain model of the ledger rules (newest answer wins, one vote per person,
 * newest evidence counts) is checked too, so the drivers cannot agree on a
 * wrong answer.
 */
import { PGlite } from "@electric-sql/pglite";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { KomodoStore } from "../src/port.js";
import { PostgresStore } from "../src/postgres.js";
import type { SqlClient } from "../src/sql-client.js";
import { SqliteStore } from "../src/sqlite.js";
import type { Bucket, EvidenceKind, VerificationResult } from "../src/types.js";
import { pr, review } from "./conformance.js";

const ACTORS = ["renata", "dev", "ops"] as const;
const BUCKETS: (Bucket | null)[] = ["Agreed", "Blocks", "Asked", "Passed on", null];
const RESULTS: VerificationResult[] = ["verified", "failed", "blocked", "not_applicable"];
const KINDS: EvidenceKind[] = ["preview", "screenshot", "test_run", "manual_observation"];

type Op =
  | { kind: "answer"; judgement: 0 | 1; actor: string; bucket: Bucket | null }
  | { kind: "vote"; judgement: 0 | 1; actor: string; value: 1 | -1 | null }
  | { kind: "evidence"; requirement: 0 | 1; actor: string; result: VerificationResult; evidenceKind: EvidenceKind };

const index = fc.constantFrom(0 as const, 1 as const);
const actor = fc.constantFrom(...ACTORS);
const op: fc.Arbitrary<Op> = fc.oneof(
  fc.record({ kind: fc.constant("answer" as const), judgement: index, actor, bucket: fc.constantFrom(...BUCKETS) }),
  fc.record({ kind: fc.constant("vote" as const), judgement: index, actor, value: fc.constantFrom(1 as const, -1 as const, null) }),
  fc.record({
    kind: fc.constant("evidence" as const),
    requirement: index,
    actor,
    result: fc.constantFrom(...RESULTS),
    evidenceKind: fc.constantFrom(...KINDS),
  }),
);

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

/** Everything a screen derives from the ledgers, with the ids and clocks each driver mints for itself removed. */
async function observe(store: KomodoStore, prId: string, reviewId: string) {
  const detail = await store.loadReview(reviewId);
  const snapshot = await store.snapshot();
  const judgment = snapshot.judgments.find((j) => j.prId === prId);
  return {
    answers: detail!.answers.map(({ id: _id, createdAt: _at, ...a }) => a),
    votes: detail!.votes.map(({ createdAt: _at, ...v }) => v),
    verifications: detail!.verifications.map(({ id: _id, createdAt: _at, ...v }) => v),
    ledger: (await store.listAnswers(reviewId)).map(({ id: _id, createdAt: _at, ...a }) => a),
    evidence: (await store.listVerificationEntries(reviewId)).map(({ id: _id, createdAt: _at, ...v }) => v),
    summary: snapshot.verificationSummaries.find((s) => s.reviewId === reviewId) ?? null,
    engagement: judgment && {
      addressedComments: judgment.addressedComments,
      totalComments: judgment.totalComments,
      upvotes: judgment.upvotes,
      downvotes: judgment.downvotes,
    },
  };
}

describe("SQLite and Postgres agree on the ledgers", () => {
  let sqlite: KomodoStore;
  let postgres: KomodoStore;
  let next = 1;

  beforeAll(async () => {
    sqlite = new SqliteStore({ path: ":memory:" });
    postgres = await PostgresStore.fromClient(fromPGlite(new PGlite()));
    for (const store of [sqlite, postgres]) {
      await store.upsertRepository({
        id: "acme/api", owner: "acme", name: "api", provider: "github", enabled: true, reviewCount: 0,
      });
    }
  }, 60_000);

  afterAll(async () => {
    await sqlite?.close();
    await postgres?.close();
  });

  it(
    "derives the same answers, votes, evidence and counts from the same writes",
    async () => {
      await fc.assert(
        fc.asyncProperty(fc.array(op, { minLength: 1, maxLength: 20 }), async (ops) => {
          // A fresh pull request per run keeps runs independent without
          // paying for a new PGlite each time.
          const number = next++;
          const ids = await Promise.all(
            [sqlite, postgres].map(async (store) => {
              const prId = await store.upsertPullRequest(pr({ number, url: `https://github.com/acme/api/pull/${number}` }));
              await store.upsertJudgment({
                prId, headSha: "aaa111", verdict: null, status: "completed", impact: "low", score: 50,
              });
              const reviewId = await store.saveReview(review({ prId }));
              const requirements = (await store.loadReview(reviewId))!.verificationRequirements.map((r) => r.id);
              return { store, prId, reviewId, requirements };
            }),
          );
          expect(ids[0].reviewId).toBe(ids[1].reviewId);

          // Every write in the same millisecond: the hardest case for "newest
          // wins", and the one a fast double-click produces. Each driver has
          // to fall back on its own append order, and both have to agree.
          const clock = vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
          try {
            for (const step of ops) {
              for (const { store, reviewId, requirements } of ids) {
                if (step.kind === "answer") {
                  await store.recordAnswer({
                    judgementId: `${reviewId}:${step.judgement}`,
                    actorLogin: step.actor,
                    bucket: step.bucket,
                    optionLabel: step.bucket ? `${step.bucket} option` : null,
                    note: step.bucket === "Asked" ? "Why this way?" : null,
                    blocking: step.bucket === "Blocks",
                  });
                } else if (step.kind === "vote") {
                  await store.recordVote({
                    judgementId: `${reviewId}:${step.judgement}`,
                    actorLogin: step.actor,
                    value: step.value,
                  });
                } else {
                  await store.recordVerification({
                    requirementId: requirements[step.requirement],
                    actorLogin: step.actor,
                    result: step.result,
                    evidenceKind: step.evidenceKind,
                  });
                }
              }
            }
          } finally {
            clock.mockRestore();
          }

          const [a, b] = await Promise.all(ids.map(({ store, prId, reviewId }) => observe(store, prId, reviewId)));
          expect(b).toEqual(a);

          // The oracle: the ledger rules, restated without a database.
          const answers = ops.filter((o): o is Extract<Op, { kind: "answer" }> => o.kind === "answer");
          const newestAnswer = (j: number) => answers.filter((o) => o.judgement === j).at(-1);
          for (const j of [0, 1] as const) {
            const want = newestAnswer(j);
            const got = a.answers.find((x) => x.judgementId === `${ids[0].reviewId}:${j}`);
            expect(got?.bucket ?? null).toBe(want?.bucket ?? null);
            if (want) expect(got?.actorLogin).toBe(want.actor);
          }
          expect(a.ledger).toHaveLength(answers.length);

          const votes = new Map<string, 1 | -1>();
          for (const o of ops) {
            if (o.kind !== "vote") continue;
            const key = `${o.judgement}:${o.actor}`;
            if (o.value === null) votes.delete(key);
            else votes.set(key, o.value);
          }
          expect(a.votes).toHaveLength(votes.size);
          const values = [...votes.values()];
          if (a.engagement) {
            expect(a.engagement.upvotes).toBe(values.filter((v) => v === 1).length);
            expect(a.engagement.downvotes).toBe(values.filter((v) => v === -1).length);
            // Handing a judgement off is not addressing it.
            expect(a.engagement.addressedComments).toBe(
              [0, 1].filter((j) => {
                const bucket = newestAnswer(j)?.bucket;
                return bucket && bucket !== "Passed on";
              }).length,
            );
          }

          const evidence = ops.filter((o): o is Extract<Op, { kind: "evidence" }> => o.kind === "evidence");
          expect(a.evidence).toHaveLength(evidence.length);
          const newestResult = (r: number) => evidence.filter((o) => o.requirement === r).at(-1)?.result;
          // The fixture's first check is required, the second optional. A
          // failed or blocked optional check does not hold a review up, so
          // only the required one counts towards those two.
          if (evidence.length) {
            expect(a.summary).toMatchObject({
              total: 2,
              required: 1,
              verified: [0, 1].filter((r) => newestResult(r) === "verified").length,
              requiredVerified: newestResult(0) === "verified" ? 1 : 0,
              failed: newestResult(0) === "failed" ? 1 : 0,
              blocked: newestResult(0) === "blocked" ? 1 : 0,
            });
          }
        }),
        { seed: 20261017, numRuns: 50 },
      );
    },
    120_000,
  );
});
