import { describe, expect, it } from "vitest";

import { KomodoConfigSchema } from "../src/config.js";
import { runPasses, type PassInput } from "../src/passes.js";
import type { ReviewInput, ReviewProvider } from "../src/providers/types.js";
import type { Judgement, ReviewResult } from "../src/schema.js";

const judgement = (over: Partial<Judgement>): Judgement => ({
  path: "src/a.ts",
  line: 1,
  severity: "major",
  kind: "Risk",
  focus: "code",
  tag: "t",
  title: "A thing is true.",
  lede: "l",
  detail: "d",
  ask: "Is it?",
  sources: ["the diff"],
  sourceNote: "s",
  code: "src/a.ts:1 x",
  options: [
    { label: "a", bucket: "Blocks" },
    { label: "b", bucket: "Agreed" },
    { label: "I have a question first", bucket: "Asked" },
    { label: "Not my call", bucket: "Passed on" },
  ],
  fixPrompt: "f",
  ...over,
});

const result = (judgements: Judgement[]): ReviewResult => ({
  summary: "- s",
  walkthrough: [],
  confidence: 3,
  verdict: "v",
  effort: 2,
  verificationChecks: [],
  judgements,
});

const input: PassInput = {
  pr: {
    owner: "acme", repo: "api", number: 1, title: "t", body: "", author: "dev",
    url: "u", baseRef: "main", headRef: "h", headSha: "abc", isDraft: false, labels: [],
  },
  files: [],
  config: KomodoConfigSchema.parse({}),
};

/** Answers each pass with a judgement named after it, and remembers what it was asked. */
function fake(options: { fail?: (input: ReviewInput) => boolean; cost?: number } = {}) {
  const seen: ReviewInput[] = [];
  const provider: ReviewProvider = {
    name: "fake",
    async review(pass) {
      seen.push(pass);
      if (options.fail?.(pass)) throw new Error("boom");
      if (options.cost !== undefined) pass.onUsage?.({ costUsd: options.cost });
      const p = pass.pass;
      if (!p || p.kind === "base") return result([judgement({ line: 1, title: "Base." })]);
      if (p.kind === "lens") {
        return result([
          judgement({ path: "", line: 0, focus: p.focus, title: `Lens ${p.focus}.` }),
          // Off-lens: a lens pass may only contribute its own focus.
          judgement({ path: "src/z.ts", line: 50, focus: "code", title: "Off-lens." }),
        ]);
      }
      return result([judgement({ path: "src/b.ts", line: 9, title: "Second look." })]);
    },
  };
  return { provider, seen };
}

describe("runPasses", () => {
  it("runs one base pass at standard depth", async () => {
    const { provider, seen } = fake();
    const run = await runPasses({ provider, input, depth: "standard" });
    expect(seen.map((s) => s.pass?.kind)).toEqual(["base"]);
    expect(seen[0].turnBudget).toBe(40);
    expect(run.passes).toBe(1);
    expect(run.result.judgements.map((j) => j.title)).toEqual(["Base."]);
  });

  it("follows the base pass with a second look that sees what it raised", async () => {
    const { provider, seen } = fake();
    const run = await runPasses({ provider, input, depth: "deep" });
    expect(seen.map((s) => s.pass?.kind)).toEqual(["base", "second-look"]);
    const second = seen[1].pass;
    expect(second?.kind === "second-look" && second.prior.map((j) => j.title)).toEqual(["Base."]);
    expect(seen.every((s) => s.turnBudget === 60)).toBe(true);
    expect(run.passes).toBe(2);
    expect(run.result.judgements.map((j) => j.title)).toEqual(["Base.", "Second look."]);
  });

  it("runs three lenses beside the base pass, then a second look, at thorough depth", async () => {
    const { provider, seen } = fake();
    const run = await runPasses({ provider, input, depth: "thorough" });
    expect(seen).toHaveLength(5);
    expect(seen.at(-1)?.pass?.kind).toBe("second-look");
    expect(run.passes).toBe(5);
    expect(run.result.judgements.map((j) => j.title)).toEqual([
      "Base.",
      "Lens architecture.",
      "Lens scope.",
      "Lens tests.",
      "Second look.",
    ]);
  });

  it("carries on without a lens that failed, and counts only the passes that returned", async () => {
    const { provider } = fake({
      fail: (i) => i.pass?.kind === "lens" && i.pass.focus === "scope",
    });
    const run = await runPasses({ provider, input, depth: "thorough" });
    expect(run.passes).toBe(4);
    expect(run.result.judgements.map((j) => j.title)).not.toContain("Lens scope.");
  });

  it("fails the run when the base pass fails", async () => {
    const { provider } = fake({ fail: (i) => i.pass?.kind === "base" });
    await expect(runPasses({ provider, input, depth: "deep" })).rejects.toThrow("boom");
  });

  it("sums the cost the provider reported, and says null when it reported none", async () => {
    const priced = await runPasses({ provider: fake({ cost: 0.1 }).provider, input, depth: "thorough" });
    expect(priced.costUsd).toBeCloseTo(0.5);
    const unpriced = await runPasses({ provider: fake().provider, input, depth: "thorough" });
    expect(unpriced.costUsd).toBeNull();
  });

  it("counts the cost of a pass that reported it and then failed, but not the pass", async () => {
    const base = fake({ cost: 0.1 }).provider;
    const provider: ReviewProvider = {
      name: "fake",
      async review(pass, onProgress) {
        if (pass.pass?.kind === "lens" && pass.pass.focus === "scope") {
          pass.onUsage?.({ costUsd: 0.1 });
          throw new Error("boom");
        }
        return base.review(pass, onProgress);
      },
    };
    const run = await runPasses({ provider, input, depth: "thorough" });
    expect(run.passes).toBe(4);
    expect(run.costUsd).toBeCloseTo(0.5);
  });
});
