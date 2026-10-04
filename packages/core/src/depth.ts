/**
 * How much a review spends.
 *
 * A standard review is one pass over the diff and the code it touches. Deep
 * adds a second look aimed at what the first pass did not raise. Thorough
 * gives architecture, scope and tests a pass each, in parallel, and then the
 * second look. More passes buy a better brief for the person reviewing — more
 * of the decisions they have to make, and more of the results they have to
 * observe. They never buy a merge decision; see AGENTS.md rule 15.
 *
 * No imports, on purpose: this is vocabulary, and anything may need it.
 */
export const REVIEW_DEPTHS = ["standard", "deep", "thorough"] as const;
export type ReviewDepth = (typeof REVIEW_DEPTHS)[number];

export const DEPTH_RANK: Record<ReviewDepth, number> = {
  standard: 0,
  deep: 1,
  thorough: 2,
};

/**
 * Passes a run at this depth makes when every pass returns.
 *
 * One pass is one credit, and this table is what the settings screen and the
 * review button show next to each depth. A run that lost an optional pass
 * records fewer — see `runPasses`.
 */
export const DEPTH_PASSES: Record<ReviewDepth, number> = {
  standard: 1,
  deep: 2,
  thorough: 5,
};

/**
 * Agent turns each pass may take, for providers that run an agent loop.
 *
 * Standard keeps the 40 the Claude provider always used. A deeper pass is
 * asked to trace further — callers, configuration, tests outside the diff —
 * and that takes turns.
 */
export const DEPTH_TURNS: Record<ReviewDepth, number> = {
  standard: 40,
  deep: 60,
  thorough: 80,
};

export const DEPTH_LABEL: Record<ReviewDepth, string> = {
  standard: "Standard",
  deep: "Deep",
  thorough: "Thorough",
};

/**
 * A depth from a flag or a form field, refused with the choices spelled out.
 *
 * Trimmed and lower-cased so `--depth Thorough` works; anything else throws
 * here, before a model has been asked for anything, so a typo costs nothing.
 */
export function parseDepth(value: string): ReviewDepth {
  const depth = value.trim().toLowerCase();
  if ((REVIEW_DEPTHS as readonly string[]).includes(depth)) return depth as ReviewDepth;
  throw new Error(`Unknown review depth "${value}". Use standard, deep or thorough.`);
}
