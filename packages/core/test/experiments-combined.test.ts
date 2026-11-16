import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { KomodoConfigSchema } from "../src/config.js";
import type { GitHubClient } from "../src/github.js";
import { runReview } from "../src/pipeline.js";
import type { ReviewInput, ReviewProvider } from "../src/providers/types.js";
import type { Judgement, ReviewResult } from "../src/schema.js";

/**
 * The three eval experiments were built on separate branches. Each has its
 * own tests; this one switches all three on in one run and checks they
 * compose: grouping splits the change, pin moves each bundle's judgements
 * before the merge, reflect sees the merged set, and cost adds up.
 */

const judgement = (over: Partial<Judgement>): Judgement => ({
  path: "src/a.ts", line: 1, severity: "major", kind: "Risk", focus: "code", tag: "t",
  title: "A thing is true.", lede: "l", detail: "d", ask: "Is it?", sources: ["the diff"],
  sourceNote: "s", code: "src/a.ts:1 x",
  options: [
    { label: "a", bucket: "Blocks" },
    { label: "b", bucket: "Agreed" },
    { label: "I have a question first", bucket: "Asked" },
    { label: "Not my call", bucket: "Passed on" },
  ],
  fixPrompt: "f",
  ...over,
});

const result = (over: Partial<ReviewResult> = {}): ReviewResult => ({
  intent: "i", summary: "- s", walkthrough: [], confidence: 4, verdict: "v", effort: 2,
  verificationChecks: [], judgements: [], ...over,
});

const lines = (path: string) => Array.from({ length: 40 }, (_, i) => `const ${path.replace(/\W/g, "_")}_${i + 1} = ${i + 1};`);
const patchFor = (path: string) => `@@ -0,0 +1,40 @@\n${lines(path).map((l) => `+${l}`).join("\n")}`;

// Unrelated directories so no relation key pairs them, and more files than
// one bundle holds (ten), so grouping has to split the change.
const PATHS = Array.from({ length: 12 }, (_, i) => `dir${String(i).padStart(2, "0")}/file${i}.ts`);

const github = {
  async getPR(r: { owner: string; repo: string; number: number }) {
    return {
      ...r, title: "Many things", body: "", author: "dev", url: "u",
      baseRef: "main", headRef: "many", headSha: "abc123", isDraft: false, labels: [],
    };
  },
  async listFiles() {
    return PATHS.map((path) => ({ path, status: "added", additions: 40, deletions: 0, patch: patchFor(path) }));
  },
} as unknown as GitHubClient;

describe("grouping + pin + reflect together", () => {
  const dirs: string[] = [];
  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });

  it("composes: bundles reviewed, judgements re-anchored, one dropped by reflection, cost summed", async () => {
    const reviewed: ReviewInput[] = [];
    let reflectedCount = 0;
    const provider: ReviewProvider = {
      name: "fake",
      async review(input) {
        reviewed.push(input);
        input.onUsage?.({ costUsd: 1, inputTokens: 100, outputTokens: 10 });
        const base = !input.pass || input.pass.kind === "base";
        // The model cites line 1 but quotes line 7: pin must move it to 7.
        return result({
          judgements: base
            ? input.files.map((f) =>
                judgement({ path: f.path, line: 1, endLine: undefined, title: `About ${f.path}.`, anchor: lines(f.path)[6] }),
              )
            : [],
        });
      },
      async reflect(input) {
        reflectedCount = input.judgements.length;
        input.onUsage?.({ costUsd: 0.5, inputTokens: 50, outputTokens: 5 });
        return {
          verdicts: input.judgements.map((_, i) => ({
            id: `j-${i}`,
            analysis: "checked",
            verdict: i === 0 ? ("drop" as const) : ("keep" as const),
            reason: i === 0 ? "contradicted" : "holds",
            revision: null,
          })),
        };
      },
    };

    const outDir = mkdtempSync(join(tmpdir(), "komodo-combined-"));
    dirs.push(outDir);
    const outcome = await runReview({
      ref: { owner: "acme", repo: "api", number: 1 },
      provider,
      github,
      config: KomodoConfigSchema.parse({}),
      post: false,
      outDir,
      experiments: ["grouping", "pin", "reflect"],
    });

    // grouping: more than one isolated review, every file seen exactly once.
    expect(reviewed.length).toBeGreaterThan(1);
    expect(reviewed.flatMap((i) => i.files.map((f) => f.path)).sort()).toEqual([...PATHS].sort());
    for (const input of reviewed) expect(input.experiments).toEqual(["grouping", "pin", "reflect"]);

    // pin: every judgement moved from the cited line to the quoted one.
    expect(outcome.pin).toMatchObject({ anchored: PATHS.length, moved: PATHS.length, unmatched: 0 });

    // reflect: saw the merged set across bundles, dropped exactly one.
    expect(reflectedCount).toBe(PATHS.length);
    expect(outcome.droppedJudgements.filter((j) => j.droppedBy === "reflect")).toHaveLength(1);
    const shown = outcome.record.result.judgements;
    expect(shown).toHaveLength(PATHS.length - 1);
    for (const j of shown) expect(j.line).toBe(7);

    // cost: one per bundle review plus the reflection.
    expect(outcome.record.run?.costUsd).toBeCloseTo(reviewed.length + 0.5);
  });
});
