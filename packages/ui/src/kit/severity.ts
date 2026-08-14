/**
 * Single source of truth for severity presentation.
 * Previously duplicated across reviews/[id]/page.tsx and packages/ui/src/index.css.
 */
export type Severity = "critical" | "major" | "minor" | "trivial";

export const SEVERITY_ORDER: Severity[] = ["critical", "major", "minor", "trivial"];

export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 4,
  major: 3,
  minor: 2,
  trivial: 1,
};

export const SEVERITY_COLOR: Record<Severity, string> = {
  critical: "#ef4444",
  major: "#f97316",
  minor: "#eab308",
  trivial: "#3b82f6",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  major: "Major",
  minor: "Minor",
  trivial: "Trivial",
};


export function isSeverity(value: string): value is Severity {
  return value in SEVERITY_RANK;
}

/** Sort findings most-severe-first. */
export function bySeverity<T extends { severity: string }>(a: T, b: T): number {
  const rank = (s: string) => (isSeverity(s) ? SEVERITY_RANK[s] : 0);
  return rank(b.severity) - rank(a.severity);
}
