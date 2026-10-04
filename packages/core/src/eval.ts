import { z } from "zod";

import { REVIEW_DEPTHS } from "./depth.js";
import type { Judgement } from "./schema.js";

/**
 * A known defect a review of this pull request should raise.
 *
 * Scored against judgements, not against wording alone: the path has to
 * match, the line has to fall in range when one is given, and `match` — a
 * case-insensitive regular expression — has to find the idea somewhere in
 * the title, lede or detail. The line range is tested for overlap, so a
 * judgement spanning lines 10-15 satisfies a range of 13-18.
 *
 * Expectations on one file should use non-overlapping ranges, because one
 * judgement can otherwise satisfy several of them and inflate the count.
 */
export const EvalExpectationSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  lines: z
    .tuple([z.number().int().min(0), z.number().int().min(0)])
    .refine(([start, end]) => start <= end, { message: "lines must be [start, end]" })
    .optional(),
  // Compiled here as well as when scoring: a pattern that does not parse must
  // fail while the file is read, with the expectation's position in the error,
  // not after the first model run has already spent quota.
  match: z
    .string()
    .min(1)
    .refine(
      (pattern) => {
        try {
          new RegExp(pattern, "i");
          return true;
        } catch {
          return false;
        }
      },
      { message: "match is not a valid regular expression" },
    ),
});
export type EvalExpectation = z.infer<typeof EvalExpectationSchema>;

export const EvalFileSchema = z.object({
  /** Depths to compare. Defaults to all three. */
  depths: z.array(z.enum(REVIEW_DEPTHS)).min(1).default([...REVIEW_DEPTHS]),
  cases: z
    .array(
      z.object({
        /** owner/repo#number, as `komodo-review pr` takes it. */
        pr: z.string().min(1),
        expect: z.array(EvalExpectationSchema).min(1),
      }),
    )
    .min(1),
});
export type EvalFile = z.infer<typeof EvalFileSchema>;

export interface CaseScore {
  hits: EvalExpectation[];
  missed: EvalExpectation[];
}

/** Which expected defects a set of judgements raised, and which it did not. */
export function scoreCase(judgements: Judgement[], expectations: EvalExpectation[]): CaseScore {
  const hits: EvalExpectation[] = [];
  const missed: EvalExpectation[] = [];
  for (const want of expectations) {
    const pattern = new RegExp(want.match, "i");
    const found = judgements.some(
      (j) =>
        j.path === want.path &&
        (!want.lines || overlaps(j, want.lines)) &&
        pattern.test(`${j.title}\n${j.lede}\n${j.detail}`),
    );
    (found ? hits : missed).push(want);
  }
  return { hits, missed };
}

/** A judgement owns line..endLine (just `line` when it has no range). */
function overlaps(j: Judgement, [lo, hi]: [number, number]): boolean {
  return j.line <= hi && (j.endLine ?? j.line) >= lo;
}
