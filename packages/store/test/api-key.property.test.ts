import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { apiKeyHashesMatch, hashApiKey } from "../src/api-key.js";

const RUNS = { seed: 20261017, numRuns: 300 };

const secret = fc.string({ minLength: 1, maxLength: 80 });

describe("hashApiKey", () => {
  it("is deterministic: the same secret always hashes the same", () => {
    fc.assert(
      fc.property(secret, (s) => {
        expect(hashApiKey(s)).toBe(hashApiKey(s));
      }),
      RUNS,
    );
  });
});

describe("apiKeyHashesMatch", () => {
  it("a hash matches itself", () => {
    fc.assert(
      fc.property(secret, (s) => {
        const h = hashApiKey(s);
        expect(apiKeyHashesMatch(h, h)).toBe(true);
      }),
      RUNS,
    );
  });

  it("two distinct secrets' hashes don't match", () => {
    fc.assert(
      fc.property(secret, secret, (a, b) => {
        fc.pre(a !== b);
        expect(apiKeyHashesMatch(hashApiKey(a), hashApiKey(b))).toBe(false);
      }),
      RUNS,
    );
  });
});
