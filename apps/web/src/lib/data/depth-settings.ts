/**
 * What a review-depth setting has to look like to reach the reviewer.
 *
 * One definition for both halves of the settings screen: the form in
 * components/settings/review-depth-section.tsx uses `depthRuleProblem` to
 * explain why a draft rule can't be added, and the `updateOrgSettings` server
 * action uses `validDepthRule` / `isReviewDepth` to refuse a patch the form
 * would never have sent. It mirrors what packages/ingest/src/settings.ts
 * (`toConfigRule`) accepts, because that seam silently drops anything else —
 * a rule saved here that the reviewer drops would be a control that lies
 * (AGENTS.md rule 3).
 *
 * No server-only imports: the client bundle pulls this in too.
 */
import { REVIEW_DEPTH_ORDER } from "@komodo/store";

import type { DepthRuleSetting, ReviewDepth } from "@/lib/types";

export type DepthRuleKind = DepthRuleSetting["kind"];

export const DEPTH_RULE_KINDS: readonly DepthRuleKind[] = [
  "files",
  "lines",
  "path",
  "label",
];

export function isReviewDepth(value: unknown): value is ReviewDepth {
  return (
    typeof value === "string" &&
    (REVIEW_DEPTH_ORDER as readonly string[]).includes(value)
  );
}

/** Why a rule with this kind and value can't be saved, or null when it can. */
export function depthRuleProblem(
  kind: DepthRuleKind,
  value: string,
): string | null {
  const v = value.trim();
  if (!v) return "Enter a value.";
  if (kind === "files" || kind === "lines") {
    return /^\d+$/.test(v) && Number(v) >= 1
      ? null
      : "Enter a whole number, 1 or more.";
  }
  // A leading "!" is negation to the glob matcher — the opposite of what
  // someone typing one into a "look harder at" rule means.
  if (kind === "path" && v.startsWith("!")) {
    return "Use path filters to exclude files; a depth rule names files to look harder at.";
  }
  return null;
}

/** Whether `rule`, which arrives over the wire untyped, is a rule we can save. */
export function validDepthRule(rule: unknown): rule is DepthRuleSetting {
  if (typeof rule !== "object" || rule === null) return false;
  const { kind, value, depth } = rule as Record<string, unknown>;
  return (
    typeof kind === "string" &&
    (DEPTH_RULE_KINDS as readonly string[]).includes(kind) &&
    typeof value === "string" &&
    depthRuleProblem(kind as DepthRuleKind, value) === null &&
    isReviewDepth(depth)
  );
}
