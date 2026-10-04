import { describe, expect, it } from "vitest";

import { EvalFileSchema, scoreCase } from "../src/eval.js";
import type { Judgement } from "../src/schema.js";

const j = (over: Partial<Judgement>) =>
  ({
    path: "src/db.js", line: 16, focus: "code", severity: "critical",
    title: "Search interpolates the name into SQL.", lede: "An attacker can inject SQL.",
    detail: "Use a parameter.", ...over,
  }) as Judgement;

const expectations = EvalFileSchema.parse({
  cases: [
    {
      pr: "Delavalom/komodo-playground#1",
      expect: [
        { name: "SQL injection", path: "src/db.js", lines: [14, 18], match: "inject|interpolat" },
        { name: "race", path: "src/wallet.js", match: "race|concurren" },
      ],
    },
  ],
}).cases[0].expect;

describe("scoreCase", () => {
  it("counts an expectation hit when path, line range and wording all match", () => {
    const score = scoreCase([j({})], expectations);
    expect(score.hits.map((h) => h.name)).toEqual(["SQL injection"]);
    expect(score.missed.map((m) => m.name)).toEqual(["race"]);
  });

  it("does not count a judgement outside the line range", () => {
    expect(scoreCase([j({ line: 40 })], expectations).hits).toEqual([]);
  });

  it("matches wording case-insensitively across title, lede and detail", () => {
    const hit = j({ path: "src/wallet.js", line: 12, title: "Balances can be lost.", lede: "A RACE between reads." });
    expect(scoreCase([hit], expectations).hits.map((h) => h.name)).toEqual(["race"]);
  });

  it("refuses a case with no expectations", () => {
    expect(() => EvalFileSchema.parse({ cases: [{ pr: "a/b#1", expect: [] }] })).toThrow();
  });

  it("refuses a match that is not a regular expression, naming the field", () => {
    expect(() =>
      EvalFileSchema.parse({
        cases: [{ pr: "a/b#1", expect: [{ name: "bad", path: "x.js", match: "(unclosed" }] }],
      }),
    ).toThrow("match is not a valid regular expression");
  });

  it("defaults to comparing all three depths", () => {
    const file = EvalFileSchema.parse({
      cases: [{ pr: "a/b#1", expect: [{ name: "n", path: "x.js", match: "x" }] }],
    });
    expect(file.depths).toEqual(["standard", "deep", "thorough"]);
  });
});
