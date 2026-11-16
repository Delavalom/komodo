import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { JudgeCall, JudgeFn } from "../../src/aacr/judge.js";
import {
  balancedScore,
  evaluateFileLevel,
  normalizePath,
  scoreInstance,
  stripThinkingTags,
  summarize,
  type ScoredComment,
} from "../../src/aacr/metrics.js";

const c = (path: string, note: string, from: number | null = null, to: number | null = from): ScoredComment => ({
  note,
  path,
  from_line: from,
  to_line: to,
});

/** A judge that answers from a table keyed by generated note; records every call. */
function tableJudge(table: Record<string, number[]>): JudgeFn & { calls: JudgeCall[] } {
  const calls: JudgeCall[] = [];
  const fn = (async (call: JudgeCall) => {
    calls.push(call);
    return { matched: table[call.genNote] ?? [], reason: "" };
  }) as JudgeFn & { calls: JudgeCall[] };
  fn.calls = calls;
  return fn;
}

describe("evaluateFileLevel", () => {
  it("judges each generated comment once against every reference on its file", async () => {
    const judge = tableJudge({});
    await evaluateFileLevel([c("a", "r1", 1), c("a", "r2"), c("b", "r3")], [c("a", "g1", 4, 6), c("b", "g2")], judge);
    expect(judge.calls).toEqual([
      { path: "a", genNote: "g1", genLines: "4-6", refNotes: ["r1", "r2"], refLines: ["1-1", "?"] },
      { path: "b", genNote: "g2", genLines: "?", refNotes: ["r3"], refLines: ["?"] },
    ]);
  });

  it("does not call the judge for a file with no references, but keeps the record", async () => {
    const judge = tableJudge({});
    const out = await evaluateFileLevel([c("a", "r1")], [c("z", "g")], judge);
    expect(judge.calls).toHaveLength(0);
    expect(out.records).toEqual([
      { note: "g", path: "z", from_line: null, to_line: null, matched_gt_indices: [], judge_reason: "", hit_new_gt: false },
    ]);
  });

  it("covers one-to-many and counts a duplicate hit only toward recall", async () => {
    const out = await evaluateFileLevel(
      [c("a", "r1"), c("a", "r2"), c("a", "r3")],
      [c("a", "both"), c("a", "again"), c("a", "third")],
      tableJudge({ both: [1, 2], again: [2], third: [2, 3] }),
    );
    expect(out.records.map((r) => r.hit_new_gt)).toEqual([true, false, true]);
    expect(out.matchedGenerated).toBe(2);
    expect(out.coveredReferences).toBe(3);
  });

  it("dedups in record order — by file as files first appear, not generation order", async () => {
    // b1 is generated before a2, but records are grouped by file in the
    // order files first appear, so a2 is visited (and deduped) before b1.
    const out = await evaluateFileLevel(
      [c("a", "ra"), c("b", "rb")],
      [c("a", "a1"), c("b", "b1"), c("a", "a2")],
      tableJudge({ a1: [1], a2: [1], b1: [1] }),
    );
    expect(out.records.map((r) => r.note)).toEqual(["a1", "a2", "b1"]);
    expect(out.records.map((r) => r.hit_new_gt)).toEqual([true, false, true]);
  });

  it("normalises backslashes so a Windows-style path meets its reference", async () => {
    const out = await evaluateFileLevel([c("src\\x.c", "r")], [c("src/x.c", "g")], tableJudge({ g: [1] }));
    expect(out.coveredReferences).toBe(1);
    expect(out.records[0].path).toBe("src/x.c");
  });

  it("skips <details>-only and pathless comments", async () => {
    const judge = tableJudge({});
    const out = await evaluateFileLevel(
      [c("a", "<details>x</details>"), c("a", "r")],
      [c("a", "<details>y</details>\n\n\n"), c("", "no path"), c("a", "ok")],
      judge,
    );
    expect(judge.calls).toEqual([{ path: "a", genNote: "ok", genLines: "?", refNotes: ["r"], refLines: ["?"] }]);
    expect(out.records.map((r) => r.note)).toEqual(["ok"]);
  });

  it("treats a zero line as missing, as `if from_line and to_line` does", async () => {
    const judge = tableJudge({});
    await evaluateFileLevel([c("a", "r", 0, 5)], [c("a", "g", 3, 0)], judge);
    expect(judge.calls[0]).toMatchObject({ genLines: "?", refLines: ["?"] });
  });

  it("maps 1-based judge numbers back to indices in the full reference list", async () => {
    const out = await evaluateFileLevel([c("b", "x"), c("a", "r1"), c("a", "r2")], [c("a", "g")], tableJudge({ g: [2] }));
    expect(out.records[0].matched_gt_indices).toEqual([2]);
    expect(out.referenceCovered).toEqual([false, false, true]);
  });

  it("never credits more new hits than references it covered (property)", async () => {
    const paths = ["a", "b", "c"];
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom(...paths), { maxLength: 8 }),
        fc.array(fc.tuple(fc.constantFrom(...paths), fc.array(fc.nat({ max: 8 }), { maxLength: 4 })), { maxLength: 12 }),
        async (refPaths, gens) => {
          const refs = refPaths.map((p, i) => c(p, `r${i}`));
          const generated = gens.map(([p], i) => c(p, `g${i}`));
          const judge: JudgeFn = async (call) => {
            const i = Number(call.genNote.slice(1));
            return { matched: gens[i][1].filter((n) => n >= 1 && n <= call.refNotes.length), reason: "" };
          };
          const out = await evaluateFileLevel(refs, generated, judge);
          expect(out.matchedGenerated).toBeLessThanOrEqual(out.coveredReferences);
          expect(out.matchedGenerated).toBeLessThanOrEqual(generated.length);
          expect(out.coveredReferences).toBeLessThanOrEqual(refs.length);
          // Every covered reference is on the same file as a comment that covered it.
          for (const r of out.records) for (const idx of r.matched_gt_indices) expect(refs[idx].path).toBe(r.path);
        },
      ),
    );
  });
});

describe("scoreInstance", () => {
  it("counts generated comments the judge never saw in the precision denominator", async () => {
    const score = await scoreInstance(
      { id: "x", repo: "o/r", references: [{ path: "a", note: "r", category: "", context: "" }] },
      [
        { path: "a", body: "hit" },
        { path: "", body: "no path" },
        { path: "a", body: "<details>only</details>" },
        { path: "a", body: "   " },
      ],
      tableJudge({ hit: [1] }),
    );
    expect(score.generated_notes).toBe(3); // the blank one is not a comment at all
    expect(score.matched_generated_notes).toBe(1);
    expect(score.expected_notes).toBe(1);
    expect(score.matched_file_semantic_notes).toBe(1);
  });
});

describe("summarize", () => {
  const score = (expected: number, generated: number, matchedGenerated: number, covered: number) => ({
    instance_id: "i",
    repo: "o/r",
    expected_notes: expected,
    generated_notes: generated,
    matched_generated_notes: matchedGenerated,
    matched_file_semantic_notes: covered,
    judge_errors: 0,
    comments: [],
    generated_comments: [],
  });

  it("is zero, not NaN, with nothing generated or expected", () => {
    const s = summarize({ totalInstances: 1, candidateInstances: 1, missingInstances: 1, scores: [], usage: [] });
    expect(s).toMatchObject({ file_semantic_match_rate: 0, file_semantic_recall_rate: 0, balanced_score: 0, avg_duration_seconds: 0, avg_input_tokens: 0 });
  });

  it("sums before dividing (micro-average), as upstream", () => {
    const s = summarize({
      totalInstances: 2,
      candidateInstances: 2,
      missingInstances: 0,
      scores: [score(4, 1, 1, 1), score(4, 9, 0, 0)],
      usage: [],
    });
    expect(s.file_semantic_match_rate).toBe(0.1); // 1/10, not mean(1, 0)
    expect(s.file_semantic_recall_rate).toBe(0.125);
  });

  it("computes F1 from the rounded rates, then rounds", () => {
    expect(balancedScore(0.312, 0.75)).toBe(0.441);
    expect(balancedScore(0, 0)).toBe(0);
  });

  it("strips <details> and collapses blank runs like _strip_thinking_tags", () => {
    expect(stripThinkingTags("a<details>\nx\n</details>\n\n\n\nb ")).toBe("a\n\nb");
    expect(normalizePath("a\\/b\\c")).toBe("a/b/c");
  });
});
