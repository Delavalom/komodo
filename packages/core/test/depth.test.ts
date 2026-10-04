import { describe, expect, it } from "vitest";

import { KomodoConfigSchema } from "../src/config.js";
import { DEPTH_PASSES, DEPTH_RANK, REVIEW_DEPTHS } from "../src/depth.js";

describe("depth vocabulary", () => {
  it("orders the depths from cheapest to deepest", () => {
    expect([...REVIEW_DEPTHS]).toEqual(["standard", "deep", "thorough"]);
    expect(DEPTH_RANK.standard).toBeLessThan(DEPTH_RANK.deep);
    expect(DEPTH_RANK.deep).toBeLessThan(DEPTH_RANK.thorough);
  });

  it("spends one pass on a standard review", () => {
    expect(DEPTH_PASSES).toEqual({ standard: 1, deep: 2, thorough: 5 });
  });
});

describe("depth config", () => {
  it("defaults to standard with no rules", () => {
    expect(KomodoConfigSchema.parse({}).depth).toEqual({ default: "standard", rules: [] });
  });

  it("accepts one condition per rule", () => {
    const config = KomodoConfigSchema.parse({
      depth: {
        default: "deep",
        rules: [
          { files: 28, depth: "thorough" },
          { lines: 800, depth: "thorough" },
          { path: "migrations/**", depth: "deep" },
          { label: "needs-deep-review", depth: "thorough" },
        ],
      },
    });
    expect(config.depth.default).toBe("deep");
    expect(config.depth.rules).toHaveLength(4);
  });

  it("refuses a rule with no condition", () => {
    expect(() =>
      KomodoConfigSchema.parse({ depth: { rules: [{ depth: "deep" }] } }),
    ).toThrow(/exactly one condition/);
  });

  it("refuses a rule with two conditions, which would read as an AND nobody wrote", () => {
    expect(() =>
      KomodoConfigSchema.parse({
        depth: { rules: [{ files: 10, label: "big", depth: "deep" }] },
      }),
    ).toThrow(/exactly one condition/);
  });
});
