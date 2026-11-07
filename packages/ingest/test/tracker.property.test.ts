import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { findIssueKeys } from "../src/tracker.js";

const RUNS = { seed: 20261017, numRuns: 300 };

// `findIssueKeys` matches /\b([A-Z][A-Z0-9]{1,9})-(\d{1,6})\b/g against the
// uppercased text, so every key it returns must match this (case-sensitive,
// already-uppercase) shape.
const KEY_SHAPE = /^[A-Z][A-Z0-9]{1,9}-\d{1,6}$/;

const prefix = fc.stringMatching(/^[A-Za-z][A-Za-z0-9]{1,9}$/);
const digits = fc.stringMatching(/^[0-9]{1,6}$/);
const key = fc.tuple(prefix, digits).map(([p, d]) => `${p}-${d}`);

// Surrounding text that can't itself glue onto the key and extend or shrink
// its word-boundary match: no letters, digits or "-" (part of the key shape
// itself) and no "_" either — `\b` treats "_" as a word character, so e.g.
// "_ABC-123" has no boundary before "A" and would not match at all.
const filler = fc.stringMatching(/^[ :,.()[\]/]{0,20}$/);

describe("findIssueKeys", () => {
  it("every returned key appears (case-insensitively) in the input and matches the key shape", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(filler, key, filler), { minLength: 1, maxLength: 4 }), (parts) => {
        const texts = parts.map(([a, k, b]) => `${a}${k}${b}`);
        const keys = findIssueKeys(...texts);
        for (const k of keys) {
          expect(k).toMatch(KEY_SHAPE);
          expect(texts.some((t) => t.toUpperCase().includes(k))).toBe(true);
        }
      }),
      RUNS,
    );
  });

  it("finds every embedded key at least once, with no duplicates", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(filler, key, filler), { minLength: 1, maxLength: 4 }), (parts) => {
        const texts = parts.map(([a, k, b]) => `${a}${k}${b}`);
        const want = new Set(parts.map(([, k]) => k.toUpperCase()));
        const got = findIssueKeys(...texts);
        expect(new Set(got)).toEqual(want);
        expect(got.length).toBe(new Set(got).size);
      }),
      RUNS,
    );
  });
});
