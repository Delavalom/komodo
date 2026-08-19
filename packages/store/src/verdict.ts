/**
 * The call, derived from the same numbers the reader sees.
 *
 * Shared by the reviewer and the seeder deliberately: a judgment that
 * disagreed with its own score would be worse than no judgment at all, and
 * two copies of this rule would eventually disagree.
 */
import type { ImpactLevel, ReviewStatus, Verdict } from "./types.js";

export function verdictFor(
  status: ReviewStatus,
  score: number,
  impact: ImpactLevel,
): Verdict | null {
  if (status !== "completed") return null;
  if (score >= 5) return "ship";
  if (score >= 4) return impact === "critical" ? "needs_work" : "ship_with_notes";
  if (score >= 2) return "needs_work";
  return "blocked";
}
