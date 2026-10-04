import { describe, expect, it } from "vitest";

import { KomodoConfigSchema } from "../src/config.js";
import { DEPTH_PASSES, DEPTH_RANK, parseDepth, REVIEW_DEPTHS } from "../src/depth.js";
import { resolveDepth } from "../src/depth-rules.js";

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

  it("refuses a negated path, which picomatch reads as 'any file not matching'", () => {
    expect(() =>
      KomodoConfigSchema.parse({ depth: { rules: [{ path: "!**/*.md", depth: "deep" }] } }),
    ).toThrow(/path_filters/);
  });

  it("trims a label and a path, so a padded one matches as it would off the screen", () => {
    const config = KomodoConfigSchema.parse({
      depth: { rules: [{ label: " risky ", depth: "deep" }] },
    });
    expect(config.depth.rules[0]).toEqual({ label: "risky", depth: "deep" });
    expect(() =>
      KomodoConfigSchema.parse({ depth: { rules: [{ path: " !**/*.md", depth: "deep" }] } }),
    ).toThrow(/path_filters/);
  });

  it("refuses a misspelled key rather than dropping it", () => {
    expect(() =>
      KomodoConfigSchema.parse({
        depth: { rules: [{ files: 10, lable: "x", depth: "deep" }] },
      }),
    ).toThrow();
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

const files = (n: number, lines = 10, prefix = "src/f") =>
  Array.from({ length: n }, (_, i) => ({
    path: `${prefix}${i}.ts`,
    additions: lines,
    deletions: 0,
  }));

const withRules = (rules: unknown[], fallback = "standard") =>
  KomodoConfigSchema.parse({ depth: { default: fallback, rules } });

describe("resolveDepth", () => {
  it("uses the deployment default when nothing matches", () => {
    expect(resolveDepth(withRules([]), { files: files(3), labels: [] })).toEqual({
      depth: "standard",
      reason: "deployment default",
    });
  });

  it("raises the depth on a file-count rule and says why", () => {
    const decision = resolveDepth(withRules([{ files: 28, depth: "thorough" }]), {
      files: files(31),
      labels: [],
    });
    expect(decision).toEqual({
      depth: "thorough",
      reason: "31 files changed (rule: at least 28)",
    });
  });

  it("counts added and deleted lines for a line rule", () => {
    const decision = resolveDepth(withRules([{ lines: 100, depth: "deep" }]), {
      files: [{ path: "a.ts", additions: 70, deletions: 40 }],
      labels: [],
    });
    expect(decision).toEqual({ depth: "deep", reason: "110 lines changed (rule: at least 100)" });
  });

  it("matches a path glob, dotfiles included", () => {
    const decision = resolveDepth(withRules([{ path: "**/migrations/**", depth: "deep" }]), {
      files: [{ path: "db/migrations/001.sql", additions: 1, deletions: 0 }],
      labels: [],
    });
    expect(decision).toEqual({
      depth: "deep",
      reason: "touches db/migrations/001.sql (rule: **/migrations/**)",
    });
    // A leading-dot directory only matches with `dot: true`.
    expect(
      resolveDepth(withRules([{ path: "**/*.yml", depth: "deep" }]), {
        files: [{ path: ".github/workflows/ci.yml", additions: 1, deletions: 0 }],
        labels: [],
      }),
    ).toEqual({
      depth: "deep",
      reason: "touches .github/workflows/ci.yml (rule: **/*.yml)",
    });
  });

  it("fires exactly at the threshold", () => {
    expect(
      resolveDepth(withRules([{ files: 28, depth: "thorough" }]), {
        files: files(28),
        labels: [],
      }),
    ).toEqual({ depth: "thorough", reason: "28 files changed (rule: at least 28)" });
  });

  it("keeps the first rule's reason when two rules reach the same depth", () => {
    const decision = resolveDepth(
      withRules([
        { files: 2, depth: "deep" },
        { label: "risky", depth: "deep" },
      ]),
      { files: files(5), labels: ["risky"] },
    );
    expect(decision).toEqual({ depth: "deep", reason: "5 files changed (rule: at least 2)" });
  });

  it("leaves the default when a path rule matches nothing", () => {
    expect(
      resolveDepth(withRules([{ path: "migrations/**", depth: "deep" }]), {
        files: files(3),
        labels: [],
      }),
    ).toEqual({ depth: "standard", reason: "deployment default" });
  });

  it("gives a plain reason when the request names no actor", () => {
    expect(
      resolveDepth(withRules([]), { files: files(1), labels: [] }, { depth: "deep", by: null }),
    ).toEqual({ depth: "deep", reason: "requested" });
  });

  it("matches a label regardless of case", () => {
    const decision = resolveDepth(withRules([{ label: "Needs-Deep-Review", depth: "thorough" }]), {
      files: files(1),
      labels: ["needs-deep-review"],
    });
    expect(decision).toEqual({ depth: "thorough", reason: "labelled needs-deep-review" });
  });

  it("takes the deepest matching rule whatever order the rules are in", () => {
    const decision = resolveDepth(
      withRules([
        { files: 2, depth: "deep" },
        { label: "risky", depth: "thorough" },
      ]),
      { files: files(5), labels: ["risky"] },
    );
    expect(decision.depth).toBe("thorough");
  });

  it("never lowers a review below the default", () => {
    const decision = resolveDepth(withRules([{ files: 1, depth: "standard" }], "deep"), {
      files: files(5),
      labels: [],
    });
    expect(decision).toEqual({ depth: "deep", reason: "deployment default" });
  });

  it("lets a person's request override the rules, in either direction", () => {
    const config = withRules([{ files: 1, depth: "thorough" }]);
    expect(
      resolveDepth(config, { files: files(5), labels: [] }, { depth: "standard", by: "renata" }),
    ).toEqual({ depth: "standard", reason: "requested by renata" });
    expect(
      resolveDepth(config, { files: files(5), labels: [] }, { depth: "deep" }),
    ).toEqual({ depth: "deep", reason: "requested" });
  });
});

describe("parseDepth", () => {
  it("accepts a depth name, case-insensitively", () => {
    expect(parseDepth("Thorough")).toBe("thorough");
  });

  it("names the choices when it refuses", () => {
    expect(() => parseDepth("max")).toThrow("standard, deep or thorough");
  });
});
