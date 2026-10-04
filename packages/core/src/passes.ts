import { DEPTH_TURNS, type ReviewDepth } from "./depth.js";
import { mergeResults } from "./merge.js";
import type { LensFocus, ReviewInput, ReviewPass, ReviewProvider } from "./providers/types.js";
import type { ReviewResult } from "./schema.js";

const LENSES: readonly LensFocus[] = ["architecture", "scope", "tests"];

/** One review's input, before a pass has been chosen for it. */
export type PassInput = Omit<ReviewInput, "pass" | "turnBudget" | "onUsage">;

export interface PassRun {
  result: ReviewResult;
  /**
   * Passes that returned a result — one credit each. Fewer than
   * DEPTH_PASSES[depth] means an optional pass failed and the run carried on
   * without it, which the review page says rather than hides.
   */
  passes: number;
  /** Summed over the passes that reported a cost; null when none did. */
  costUsd: number | null;
}

/**
 * Runs as many passes as the depth calls for, and merges them.
 *
 * Every pass is an ordinary `provider.review` call, so depth works the same
 * on every provider — what changes per pass is the prompt section and the
 * turn budget. Only the base pass is required. A lens or a second look that
 * fails is reported through `onProgress` and left out; losing one extra pass
 * should cost that pass, not the whole review.
 */
export async function runPasses(opts: {
  provider: ReviewProvider;
  input: PassInput;
  depth: ReviewDepth;
  onProgress?: (msg: string) => void;
}): Promise<PassRun> {
  const { provider, input, depth, onProgress } = opts;
  const tally = { passes: 0, costUsd: null as number | null };
  const turnBudget = DEPTH_TURNS[depth];

  const run = async (pass: ReviewPass): Promise<ReviewResult> => {
    const result = await provider.review(
      {
        ...input,
        pass,
        turnBudget,
        onUsage: (usage) => {
          if (typeof usage.costUsd === "number") {
            tally.costUsd = (tally.costUsd ?? 0) + usage.costUsd;
          }
        },
      },
      onProgress,
    );
    tally.passes++;
    return result;
  };

  const optional = async (pass: ReviewPass, label: string): Promise<ReviewResult | null> => {
    try {
      return await run(pass);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      onProgress?.(`  the ${label} pass failed; continuing without it: ${message}`);
      return null;
    }
  };

  /** A lens may only contribute judgements in its own focus. */
  const lens = async (focus: LensFocus): Promise<ReviewResult | null> => {
    const result = await optional({ kind: "lens", focus }, focus);
    return result && { ...result, judgements: result.judgements.filter((j) => j.focus === focus) };
  };

  if (depth === "standard") {
    const result = await run({ kind: "base" });
    return { result, ...tally };
  }

  let merged: ReviewResult;
  if (depth === "thorough") {
    onProgress?.("  running the base pass and three focused passes in parallel…");
    const [base, ...lenses] = await Promise.all([run({ kind: "base" }), ...LENSES.map(lens)]);
    merged = mergeResults(
      base,
      lenses.filter((r): r is ReviewResult => r !== null),
    );
  } else {
    merged = await run({ kind: "base" });
  }

  onProgress?.("  running a second look for what the earlier passes missed…");
  const second = await optional({ kind: "second-look", prior: merged.judgements }, "second-look");
  if (second) merged = mergeResults(merged, [second]);

  return { result: merged, ...tally };
}
