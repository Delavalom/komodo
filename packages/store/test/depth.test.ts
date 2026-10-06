import { describe, expect, it } from "vitest";

import { describeDepth, sizeBand, summarizeDepthOutcomes } from "../src/depth.js";
import type { ReviewRunOutcome } from "../src/types.js";

const run = (over: Partial<ReviewRunOutcome> = {}): ReviewRunOutcome => ({
  reviewId: "r", prId: "p", repoId: "acme/api", author: "renata", createdAt: 0,
  savedAt: 0, depth: "standard", depthReason: "deployment default", passes: 1, costUsd: null, changedFiles: 3,
  judgements: 2, severeJudgements: 1, upheld: 1, severeUpheld: 1,
  ...over,
});

describe("sizeBand", () => {
  it("puts the boundaries where the panel says they are", () => {
    expect(sizeBand(10)).toBe("small");
    expect(sizeBand(11)).toBe("medium");
    expect(sizeBand(27)).toBe("medium");
    expect(sizeBand(28)).toBe("large");
  });
});

describe("summarizeDepthOutcomes", () => {
  it("reports upheld critical and major judgements per run, per band and depth", () => {
    const table = summarizeDepthOutcomes([
      run({ changedFiles: 30, depth: "thorough", severeUpheld: 3, passes: 5, costUsd: 1 }),
      run({ changedFiles: 40, depth: "thorough", severeUpheld: 1, passes: 4, costUsd: 0.5 }),
      run({ changedFiles: 2, depth: "standard", severeUpheld: 0 }),
    ]);
    expect(table.large.thorough).toEqual({
      runs: 2, severeUpheld: 4, upheld: 2, passes: 9, costUsd: 1.5, severeUpheldPerRun: 2,
    });
    expect(table.small.standard.severeUpheldPerRun).toBe(0);
  });

  it("leaves a cell with no runs empty rather than zero", () => {
    expect(summarizeDepthOutcomes([]).medium.deep).toEqual({
      runs: 0, severeUpheld: 0, upheld: 0, passes: 0, costUsd: null, severeUpheldPerRun: null,
    });
  });

  it("leaves out runs whose depth Komodo did not decide", () => {
    // Saved before depth existed, or submitted from someone's own agent: one
    // standard pass is all that was observed, not a choice of standard.
    const table = summarizeDepthOutcomes([
      run({ changedFiles: 2, depthReason: "", severeUpheld: 4 }),
      run({ changedFiles: 2, severeUpheld: 1 }),
    ]);
    expect(table.small.standard).toMatchObject({ runs: 1, severeUpheld: 1 });
  });
});

describe("describeDepth", () => {
  it("says how many passes a full run made, and why it ran at that depth", () => {
    expect(describeDepth({ depth: "thorough", passes: 5, depthReason: "labelled risky" })).toBe(
      "Thorough · 5 passes — labelled risky",
    );
  });

  it("says when a run lost a pass", () => {
    expect(describeDepth({ depth: "thorough", passes: 4, depthReason: "" })).toBe(
      "Thorough · 4 of 5 passes",
    );
  });

  it("does not say 'of' when a run made more passes than planned", () => {
    expect(describeDepth({ depth: "thorough", passes: 6, depthReason: "" })).toBe(
      "Thorough · 6 passes",
    );
  });

  it("uses the singular for one pass", () => {
    expect(describeDepth({ depth: "standard", passes: 1, depthReason: "deployment default" })).toBe(
      "Standard · 1 pass — deployment default",
    );
  });
});
