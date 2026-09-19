/**
 * Semantic color/typography roles, ported from the diagram-design skill's
 * style-guide.md — but mapped onto Komodo's own CSS variables
 * (apps/web/src/app/globals.css) instead of the skill's fixed palette, so
 * diagrams inherit Komodo's brand and light/dark mode automatically. Every
 * variable here already stores an "H S% L%" triplet, so `hsl(var(--x) / a)`
 * is the same at-opacity syntax the skill's style guide uses for "ink @ 0.05".
 */
export interface Theme {
  paper: string;
  paper2: string;
  ink: string;
  inkAt: (opacity: number) => string;
  muted: string;
  soft: string;
  rule: string;
  accent: string;
  accentTint: string;
  link: string;
  fontSans: string;
  fontMono: string;
}

export const theme: Theme = {
  paper: "hsl(var(--background))",
  paper2: "hsl(var(--muted-accent))",
  ink: "hsl(var(--foreground))",
  inkAt: (opacity: number) => `hsl(var(--foreground) / ${opacity})`,
  muted: "hsl(var(--muted-foreground))",
  soft: "hsl(var(--muted-foreground) / 0.75)",
  rule: "hsl(var(--border))",
  accent: "hsl(var(--accent))",
  accentTint: "hsl(var(--accent) / 0.08)",
  link: "hsl(var(--info))",
  fontSans: "var(--font-sans)",
  fontMono: "var(--font-mono)",
};

/** 4px grid, per SKILL.md §7 — every coordinate, size, and gap divisible by 4. */
export const GRID = 4;

export const TYPE_SCALE = {
  /** Human-readable labels — Geist sans role, mapped to Komodo's font-sans. */
  nodeName: 12,
  /** Ports, protocols, field types — Geist Mono role. */
  sublabel: 9,
  /** Type tags, axis labels — Geist Mono role, uppercase, tracked. */
  eyebrow: 8,
  /** Arrow annotations — Geist Mono role. */
  arrowLabel: 8,
};

export const SPACING = {
  strokeThin: 0.8,
  strokeDefault: 1,
  strokeStrong: 1.2,
  radiusSm: 4,
  radiusMd: 6,
  radiusLg: 8,
  outerMargin: 40,
  nodeGap: 32,
  minNodeHeight: 48,
};

export function snap(value: number): number {
  return Math.round(value / GRID) * GRID;
}
