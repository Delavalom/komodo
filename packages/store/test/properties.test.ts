/**
 * Rules in the store that must hold for every input.
 *
 * Both are rules about whether a person can trust what a screen shows: which
 * check a piece of evidence belongs to, and whether a green build describes
 * the commit that would merge. Seeded, so a failure reproduces.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { CHECKS_MAX_AGE_MS, readChecks, type StoredChecks } from "../src/checks.js";
import { verificationRequirementId } from "../src/verification.js";

const RUNS = { seed: 20261017, numRuns: 300 };

/*
 * NUL is the separator the id joins its fields with, so fields are drawn
 * without it: a title containing NUL could shift text across the boundary and
 * collide. A model writing NUL into a check title is not a case worth an id
 * migration (it would reassign stored evidence), but the limit is stated here
 * rather than left for someone to rediscover.
 */
const text = fc.string({ maxLength: 40 }).filter((s) => !s.includes("\u0000"));
const check = fc.record({ title: text, instruction: text, expectedResult: text });
const reviewId = fc.constantFrom("acme/api#1@aaa111", "acme/api#2@bbb222");

describe("verificationRequirementId — properties", () => {
  it("is the same for the same check in the same review", () => {
    fc.assert(
      fc.property(reviewId, check, (id, c) => {
        expect(verificationRequirementId(id, c)).toBe(verificationRequirementId(id, { ...c }));
      }),
      RUNS,
    );
  });

  it("differs when any one field differs", () => {
    fc.assert(
      fc.property(reviewId, check, check, (id, a, b) => {
        fc.pre(
          a.title !== b.title || a.instruction !== b.instruction || a.expectedResult !== b.expectedResult,
        );
        expect(verificationRequirementId(id, a)).not.toBe(verificationRequirementId(id, b));
      }),
      RUNS,
    );
  });

  it("cannot be made to collide by moving text from one field into the next", () => {
    fc.assert(
      fc.property(reviewId, text, text, text, (id, a, b, c) => {
        fc.pre(b.length > 0);
        const original = verificationRequirementId(id, { title: a, instruction: b, expectedResult: c });
        const shifted = verificationRequirementId(id, {
          title: a + b[0],
          instruction: b.slice(1),
          expectedResult: c,
        });
        expect(shifted).not.toBe(original);
      }),
      RUNS,
    );
  });

  it("is scoped to its review, so a re-review never inherits another run's evidence", () => {
    fc.assert(
      fc.property(check, (c) => {
        expect(verificationRequirementId("acme/api#1@aaa111", c)).not.toBe(
          verificationRequirementId("acme/api#2@bbb222", c),
        );
      }),
      RUNS,
    );
  });
});

const NOW = 1_800_000_000_000;
const STATES = ["passing", "failing", "pending", "neutral"];

const stored: fc.Arbitrary<StoredChecks> = fc.record({
  headSha: fc.constantFrom("aaa", "bbb"),
  checksHeadSha: fc.option(fc.constantFrom("aaa", "bbb"), { nil: null }),
  checksState: fc.option(fc.constantFrom(...STATES, "success", ""), { nil: null }),
  checksPassed: fc.option(fc.nat({ max: 20 }), { nil: null }),
  checksPending: fc.option(fc.nat({ max: 20 }), { nil: null }),
  checksFailing: fc.array(fc.constantFrom("lint", "test", "build"), { maxLength: 3 }),
  checksObservedAt: fc.option(
    fc.integer({ min: NOW - 2 * CHECKS_MAX_AGE_MS, max: NOW }),
    { nil: null },
  ),
});

describe("readChecks — properties", () => {
  it("shows a rollup exactly when it names the current head, is fresh, and uses a known state", () => {
    fc.assert(
      fc.property(stored, (row) => {
        const shown = readChecks(row, NOW) !== null;
        const trustworthy =
          row.checksObservedAt !== null &&
          row.checksHeadSha === row.headSha &&
          NOW - row.checksObservedAt <= CHECKS_MAX_AGE_MS &&
          STATES.includes(row.checksState ?? "");
        expect(shown).toBe(trustworthy);
      }),
      RUNS,
    );
  });

  it("never invents a total it was not given", () => {
    fc.assert(
      fc.property(stored, (row) => {
        const checks = readChecks(row, NOW);
        if (!checks) return;
        if (row.checksPassed === null || row.checksPending === null) expect(checks.total).toBeNull();
        else expect(checks.total).toBe(row.checksPassed + row.checksPending + row.checksFailing.length);
      }),
      RUNS,
    );
  });
});
