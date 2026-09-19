/**
 * Shared geometry and markup-safety helpers used by every type's render
 * module. Centralizing escaping here means it only has to be gotten right
 * once — this is the one place LLM-authored spec text (node names, labels)
 * meets raw SVG markup.
 */

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Deterministic, XML-id-safe slug for a diagram instance + role, so repeated
 * inline diagrams on one page never collide on `id` (accessible-SVG contract:
 * bare `title`/`desc` ids are banned for exactly this reason). */
export function slugId(instanceId: string, role: string): string {
  const safeInstance = instanceId.replace(/[^a-zA-Z0-9_-]/g, "-");
  return `${safeInstance}-${role}`;
}

/**
 * Axis-aligned or single-bend orthogonal connector between two points.
 * Mandatory connector rule #1: no diagonal lines between off-axis points —
 * every bend is a quarter-arc of radius `r`.
 */
export function orthogonalPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r = 8,
): string {
  if (x1 === x2 || y1 === y2) {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }
  const dy = y2 > y1 ? 1 : -1;
  const dx = x2 > x1 ? 1 : -1;
  const bendY = y2 - dy * r;
  return [
    `M ${x1} ${y1}`,
    `L ${x1} ${bendY}`,
    `Q ${x1} ${y2} ${x1 + dx * r} ${y2}`,
    `L ${x2} ${y2}`,
  ].join(" ");
}

/**
 * Parses an SVG path `d` string built from `M`/`L`/`Q` commands (the only
 * commands this package's renderers emit) and reports whether every straight
 * (`L`) segment is horizontal or vertical. `Q` segments are the mandatory
 * quarter-arc bend and are exempt by construction. Used by structural tests
 * to verify mandatory connector rule #1 (no diagonal lines) against the
 * actual rendered output, not just the intent of `orthogonalPath`.
 */
export function pathIsOrthogonal(d: string): boolean {
  const tokens = d.trim().split(/\s+/);
  let i = 0;
  let cur: [number, number] | null = null;
  while (i < tokens.length) {
    const cmd = tokens[i];
    if (cmd === "M" || cmd === "L") {
      const x = Number(tokens[i + 1]);
      const y = Number(tokens[i + 2]);
      if (cmd === "L" && cur && cur[0] !== x && cur[1] !== y) return false;
      cur = [x, y];
      i += 3;
    } else if (cmd === "Q") {
      // Q cx cy x y — control point then endpoint; not a straight segment.
      const x = Number(tokens[i + 3]);
      const y = Number(tokens[i + 4]);
      cur = [x, y];
      i += 5;
    } else {
      i += 1;
    }
  }
  return true;
}

export interface LabelMask {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Arrow-label mask rect, positioned with the mandatory 6-10px gap above the
 * connector stroke (rule #2) — never touching it. */
export function labelMask(centerX: number, strokeY: number, text: string, gap = 8): LabelMask {
  const width = Math.max(24, Math.min(120, text.length * 6 + 12));
  const height = 12;
  return {
    x: centerX - width / 2,
    y: strokeY - gap - height,
    width,
    height,
  };
}
