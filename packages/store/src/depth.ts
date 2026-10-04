/**
 * Review depth, for the screens.
 *
 * Re-declared rather than imported from @komodo/core for the reason every
 * vocabulary in this package is: no dependency on core, and client components
 * import from here. packages/ingest/test/settings.test.ts asserts that the
 * depth order and the pass counts agree with core's, so those two cannot drift
 * silently.
 */
import type { ReviewDepth, ReviewRunOutcome } from "./types.js";

export const REVIEW_DEPTH_ORDER: readonly ReviewDepth[] = ["standard", "deep", "thorough"];

/** Passes a full run at each depth makes. One pass is one credit. */
export const DEPTH_PASSES: Record<ReviewDepth, number> = {
  standard: 1,
  deep: 2,
  thorough: 5,
};

export const DEPTH_LABEL: Record<ReviewDepth, string> = {
  standard: "Standard",
  deep: "Deep",
  thorough: "Thorough",
};

export const SIZE_BANDS = [
  { key: "small", label: "1–10 files", max: 10 },
  { key: "medium", label: "11–27 files", max: 27 },
  { key: "large", label: "28+ files", max: Number.POSITIVE_INFINITY },
] as const;
export type SizeBand = (typeof SIZE_BANDS)[number]["key"];

export function sizeBand(changedFiles: number): SizeBand {
  return SIZE_BANDS.find((band) => changedFiles <= band.max)?.key ?? "large";
}

export interface DepthCell {
  runs: number;
  severeUpheld: number;
  upheld: number;
  passes: number;
  /** Summed over runs that reported one; null when none did. */
  costUsd: number | null;
  /** The panel's number. Null — shown as a dash — when the cell has no runs. */
  severeUpheldPerRun: number | null;
}

const emptyCell = (): DepthCell => ({
  runs: 0, severeUpheld: 0, upheld: 0, passes: 0, costUsd: null, severeUpheldPerRun: null,
});

/**
 * Whether looking harder found more of what people upheld, by PR size.
 *
 * "Upheld" is a person's answer — Blocks or Agreed — not the model's own
 * severity, so a depth that only produces more noise does not score better.
 */
export function summarizeDepthOutcomes(
  runs: readonly ReviewRunOutcome[],
): Record<SizeBand, Record<ReviewDepth, DepthCell>> {
  const table = Object.fromEntries(
    SIZE_BANDS.map((band) => [
      band.key,
      Object.fromEntries(REVIEW_DEPTH_ORDER.map((d) => [d, emptyCell()])),
    ]),
  ) as Record<SizeBand, Record<ReviewDepth, DepthCell>>;

  for (const run of runs) {
    const cell = table[sizeBand(run.changedFiles)][run.depth];
    cell.runs++;
    cell.severeUpheld += run.severeUpheld;
    cell.upheld += run.upheld;
    cell.passes += run.passes;
    if (run.costUsd !== null) cell.costUsd = (cell.costUsd ?? 0) + run.costUsd;
  }
  for (const band of Object.values(table)) {
    for (const cell of Object.values(band)) {
      cell.severeUpheldPerRun = cell.runs ? cell.severeUpheld / cell.runs : null;
    }
  }
  return table;
}

/** The run line on the review page: depth, passes, and why. */
export function describeDepth(run: {
  depth: ReviewDepth;
  passes: number;
  depthReason: string;
}): string {
  const planned = DEPTH_PASSES[run.depth];
  const passes =
    run.passes >= planned
      ? `${run.passes} ${run.passes === 1 ? "pass" : "passes"}`
      : `${run.passes} of ${planned} passes`;
  const reason = run.depthReason ? ` — ${run.depthReason}` : "";
  return `${DEPTH_LABEL[run.depth]} · ${passes}${reason}`;
}
