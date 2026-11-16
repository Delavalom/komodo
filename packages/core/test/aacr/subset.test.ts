import { describe, expect, it } from "vitest";

import { subsetComments } from "../../src/aacr/run.js";
import type { ReviewerRun } from "../../src/aacr/types.js";

const run = (details?: ReviewerRun["details"]): ReviewerRun => ({
  instanceId: "x",
  reviewer: "komodo",
  durationSeconds: 1,
  comments: [
    { path: "a", body: "code major" },
    { path: "b", body: "tests minor" },
    { path: "c", body: "code trivial" },
  ],
  details,
});

const DETAILS = [
  { focus: "code", kind: "Risk", severity: "major" },
  { focus: "tests", kind: "Gap", severity: "minor" },
  { focus: "code", kind: "Risk", severity: "trivial" },
];

describe("subsetComments", () => {
  it("returns every comment without a subset", () => {
    expect(subsetComments(run(DETAILS))).toHaveLength(3);
  });

  it("filters by focus and by severity floor, together or apart", () => {
    const bodies = (s: Parameters<typeof subsetComments>[1]) => subsetComments(run(DETAILS), s).map((c) => c.body);
    expect(bodies({ tag: "t", onlyFocus: ["code"] })).toEqual(["code major", "code trivial"]);
    expect(bodies({ tag: "t", minSeverity: "minor" })).toEqual(["code major", "tests minor"]);
    expect(bodies({ tag: "t", onlyFocus: ["code"], minSeverity: "minor" })).toEqual(["code major"]);
  });

  it("keeps everything for a reviewer that recorded no details, or misaligned ones", () => {
    expect(subsetComments(run(undefined), { tag: "t", onlyFocus: ["code"] })).toHaveLength(3);
    expect(subsetComments(run(DETAILS.slice(0, 2)), { tag: "t", onlyFocus: ["code"] })).toHaveLength(3);
  });
});
