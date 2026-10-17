/**
 * Rules that must hold for every input, not just the examples beside them.
 *
 * The example tests in merge.test.ts, eval.test.ts and
 * verification-status.test.ts say what should happen in the cases someone
 * thought of. These say what must never happen, and let fast-check look for
 * the case nobody thought of. The seed is fixed so a failure reproduces on
 * the next run and on every machine; fast-check prints the shrunk input.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { scoreCase, type EvalExpectation } from "../src/eval.js";
import { mergeResults } from "../src/merge.js";
import {
  FOCUS_LABEL,
  REVIEW_FOCI,
  SEVERITIES,
  SEVERITY_RANK,
  type Judgement,
  type ReviewResult,
  type VerificationCheck,
} from "../src/schema.js";
import { verificationStatus, type VerificationStatusSource } from "../src/verification-status.js";

const RUNS = { seed: 20261017, numRuns: 300 };

/* ── Arbitraries ─────────────────────────────────────────────────────────── */

const word = fc.constantFrom("balance", "token", "retry", "cache", "limit", "session", "lock");
const title = fc.array(word, { minLength: 1, maxLength: 3 }).map((w) => `${w.join(" ")}.`);

const judgement: fc.Arbitrary<Judgement> = fc
  .record({
    path: fc.constantFrom("", "src/a.ts", "src/b.ts"),
    line: fc.integer({ min: 0, max: 12 }),
    severity: fc.constantFrom(...SEVERITIES),
    focus: fc.constantFrom(...REVIEW_FOCI),
    title,
  })
  .map((j) => ({
    ...j,
    kind: "Risk" as const,
    tag: FOCUS_LABEL[j.focus],
    lede: "What it costs.",
    detail: "The alternative.",
    ask: "Is this acceptable?",
    sources: ["the diff"],
    sourceNote: "The diff shows it.",
    code: `${j.path}:${j.line}`,
    options: [
      { label: "Yes", bucket: "Agreed" as const },
      { label: "No", bucket: "Blocks" as const },
      { label: "I have a question first", bucket: "Asked" as const },
      { label: "Not my call", bucket: "Passed on" as const },
    ],
    fixPrompt: "Fix it.",
  }));

const check: fc.Arbitrary<VerificationCheck> = fc.record({
  title,
  instruction: fc.constant("Do the thing."),
  expectedResult: fc.constant("The thing happens."),
  evidenceKinds: fc.constant(["manual_observation" as const]),
  required: fc.boolean(),
});

const result: fc.Arbitrary<ReviewResult> = fc.record({
  summary: fc.constant("- A change"),
  walkthrough: fc.constant([]),
  confidence: fc.integer({ min: 0, max: 5 }),
  verdict: fc.constant("What the review could establish."),
  effort: fc.integer({ min: 1, max: 5 }),
  verificationChecks: fc.array(check, { maxLength: 4 }),
  judgements: fc.array(judgement, { maxLength: 6 }),
});

/* ── mergeResults ────────────────────────────────────────────────────────── */

describe("mergeResults — properties", () => {
  it("returns the base unchanged when there is nothing to merge", () => {
    fc.assert(
      fc.property(result, (base) => {
        expect(mergeResults(base, [])).toEqual(base);
      }),
      RUNS,
    );
  });

  it("adds nothing when a result is merged into itself", () => {
    // Every candidate is the same concern as itself, so it can replace a
    // reading but never add one. (Contents can still change: a more severe
    // neighbour within SAME_SPOT lines may take an earlier slot — that is the
    // merge rule, not a bug.)
    fc.assert(
      fc.property(result, (base) => {
        const merged = mergeResults(base, [base]);
        expect(merged.judgements).toHaveLength(base.judgements.length);
        expect(merged.verificationChecks).toHaveLength(base.verificationChecks.length);
      }),
      RUNS,
    );
  });

  it("never lowers a slot's severity, drops a judgement, or lets an extra pass rewrite the base's summary", () => {
    fc.assert(
      fc.property(result, fc.array(result, { maxLength: 3 }), (base, extras) => {
        const merged = mergeResults(base, extras);
        expect(merged.judgements.length).toBeGreaterThanOrEqual(base.judgements.length);
        base.judgements.forEach((j, i) => {
          expect(SEVERITY_RANK[merged.judgements[i].severity]).toBeGreaterThanOrEqual(
            SEVERITY_RANK[j.severity],
          );
        });
        expect(merged.summary).toBe(base.summary);
        expect(merged.confidence).toBe(base.confidence);
        expect(merged.effort).toBe(base.effort);
      }),
      RUNS,
    );
  });

  it("can make a check required but never optional", () => {
    fc.assert(
      fc.property(result, fc.array(result, { maxLength: 3 }), (base, extras) => {
        const merged = mergeResults(base, extras);
        base.verificationChecks.forEach((c, i) => {
          if (c.required) expect(merged.verificationChecks[i].required).toBe(true);
          expect(merged.verificationChecks[i].title).toBe(c.title);
        });
      }),
      RUNS,
    );
  });

  it("never swaps a judgement the caller keeps for one it drops", () => {
    // `accept` stands in for later filtering. Here it keeps only judgements
    // with a path, which the base's file-level ones always have.
    const accept = (j: Judgement) => j.path !== "";
    fc.assert(
      fc.property(result, fc.array(result, { maxLength: 3 }), (base, extras) => {
        const merged = mergeResults(base, extras, accept);
        base.judgements.forEach((j, i) => {
          if (accept(j)) expect(accept(merged.judgements[i])).toBe(true);
        });
      }),
      RUNS,
    );
  });
});

/* ── scoreCase ───────────────────────────────────────────────────────────── */

const expectation: fc.Arbitrary<EvalExpectation> = fc.record({
  name: fc.constant("expected defect"),
  path: fc.constantFrom("src/a.ts", "src/b.ts"),
  match: word,
});

describe("scoreCase — properties", () => {
  it("puts every expectation in exactly one of hits and missed, in order", () => {
    fc.assert(
      fc.property(fc.array(judgement, { maxLength: 6 }), fc.array(expectation, { maxLength: 6 }), (js, wants) => {
        const { hits, missed } = scoreCase(js, wants);
        expect(hits.length + missed.length).toBe(wants.length);
        // Order within each list follows the input, so a report reads in the
        // order the eval file was written.
        const hitSet = new Set(hits);
        expect(wants.filter((w) => hitSet.has(w))).toEqual(hits);
        expect(wants.filter((w) => !hitSet.has(w))).toEqual(missed);
      }),
      RUNS,
    );
  });

  it("finds nothing in an empty review", () => {
    fc.assert(
      fc.property(fc.array(expectation, { maxLength: 6 }), (wants) => {
        expect(scoreCase([], wants).hits).toEqual([]);
      }),
      RUNS,
    );
  });
});

/* ── verificationStatus ──────────────────────────────────────────────────── */

const RESULTS = ["verified", "failed", "blocked", "not_applicable"] as const;

/** Requirements r0..rN, some required, and a ledger of entries against them in append order. */
const ledger: fc.Arbitrary<VerificationStatusSource> = fc
  .array(fc.boolean(), { minLength: 0, maxLength: 5 })
  .chain((required) =>
    fc.record({
      requirements: fc.constant(required.map((r, i) => ({ id: `r${i}`, required: r }))),
      entries: required.length
        ? fc
            .array(
              fc.record({
                requirementId: fc.integer({ min: 0, max: required.length - 1 }).map((i) => `r${i}`),
                result: fc.constantFrom(...RESULTS),
              }),
              { maxLength: 12 },
            )
            .map((es) => es.map((e, i) => ({ ...e, id: `e${i}` })))
        : fc.constant([]),
    }),
  );

/** The newest entry per requirement — the ledger rule, restated as plainly as it can be. */
function latest(source: VerificationStatusSource, requirementId: string) {
  return source.entries.filter((e) => e.requirementId === requirementId).at(-1)?.result ?? null;
}

describe("verificationStatus — properties", () => {
  it("fails exactly when a required check's newest result is a failure", () => {
    fc.assert(
      fc.property(ledger, (source) => {
        const failed = source.requirements.some((r) => r.required && latest(source, r.id) === "failed");
        expect(verificationStatus(source).state === "failure").toBe(failed);
      }),
      RUNS,
    );
  });

  it("succeeds exactly when every required check's newest result is verified", () => {
    fc.assert(
      fc.property(ledger, (source) => {
        const allVerified = source.requirements
          .filter((r) => r.required)
          .every((r) => latest(source, r.id) === "verified");
        expect(verificationStatus(source).state === "success").toBe(allVerified);
      }),
      RUNS,
    );
  });

  it("ignores optional checks entirely", () => {
    fc.assert(
      fc.property(ledger, (source) => {
        const requiredOnly: VerificationStatusSource = {
          requirements: source.requirements.filter((r) => r.required),
          entries: source.entries.filter((e) =>
            source.requirements.some((r) => r.required && r.id === e.requirementId),
          ),
        };
        expect(verificationStatus(requiredOnly)).toEqual(verificationStatus(source));
      }),
      RUNS,
    );
  });

  it("gives the same version for the same ledger, and a new one when the state changes", () => {
    fc.assert(
      fc.property(ledger, ledger, (a, b) => {
        expect(verificationStatus(a).version).toBe(verificationStatus(structuredClone(a)).version);
        if (verificationStatus(a).state !== verificationStatus(b).state) {
          expect(verificationStatus(a).version).not.toBe(verificationStatus(b).version);
        }
      }),
      RUNS,
    );
  });
});
