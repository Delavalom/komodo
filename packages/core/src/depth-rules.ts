import picomatch from "picomatch";

import type { DepthRule, KomodoConfig } from "./config.js";
import { DEPTH_RANK, type ReviewDepth } from "./depth.js";

/** What a run decided, and the sentence the review page shows for it. */
export interface DepthDecision {
  depth: ReviewDepth;
  reason: string;
}

/** The facts a rule can test. Files are the reviewable set, after path filters. */
export interface DepthSubject {
  files: { path: string; additions: number; deletions: number }[];
  labels: string[];
}

/** A depth a person picked for one run. */
export interface DepthRequest {
  depth: ReviewDepth;
  /** Who asked, for the reason line. Null when the caller has no actor. */
  by?: string | null;
}

/**
 * Which depth this run gets.
 *
 * A request wins outright, in either direction: someone asking for a standard
 * pass on a pull request the rules would make thorough has a reason, and
 * Komodo second-guessing them would be a menu that does nothing. Otherwise
 * the deepest matching rule wins, and no rule can take a review below the
 * default — a rule is a reason to spend more, never less.
 */
export function resolveDepth(
  config: Pick<KomodoConfig, "depth">,
  subject: DepthSubject,
  request?: DepthRequest | null,
): DepthDecision {
  if (request) {
    return {
      depth: request.depth,
      reason: request.by ? `requested by ${request.by}` : "requested",
    };
  }

  let best: DepthDecision = { depth: config.depth.default, reason: "deployment default" };
  for (const rule of config.depth.rules) {
    // Strictly deeper only: the first rule to reach a depth keeps the reason.
    if (DEPTH_RANK[rule.depth] <= DEPTH_RANK[best.depth]) continue;
    const why = matchRule(rule, subject);
    if (why) best = { depth: rule.depth, reason: why };
  }
  return best;
}

function matchRule(rule: DepthRule, subject: DepthSubject): string | null {
  if (rule.files !== undefined) {
    const n = subject.files.length;
    return n >= rule.files ? `${n} files changed (rule: at least ${rule.files})` : null;
  }
  if (rule.lines !== undefined) {
    const n = subject.files.reduce((sum, f) => sum + f.additions + f.deletions, 0);
    return n >= rule.lines ? `${n} lines changed (rule: at least ${rule.lines})` : null;
  }
  if (rule.path !== undefined) {
    const isMatch = picomatch(rule.path, { dot: true });
    const hit = subject.files.find((f) => isMatch(f.path));
    return hit ? `touches ${hit.path} (rule: ${rule.path})` : null;
  }
  if (rule.label !== undefined) {
    const wanted = rule.label.toLowerCase();
    const hit = subject.labels.find((l) => l.toLowerCase() === wanted);
    return hit ? `labelled ${hit}` : null;
  }
  return null;
}
