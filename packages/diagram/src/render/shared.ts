import { escapeXml, labelMask, orthogonalPath, slugId } from "../geometry.js";
import { SPACING, theme, TYPE_SCALE, type Theme } from "../theme.js";

export interface RenderContext {
  instanceId: string;
  theme: Theme;
}

export function markerIds(ctx: RenderContext) {
  return {
    default: slugId(ctx.instanceId, "arrow"),
    accent: slugId(ctx.instanceId, "arrow-accent"),
    link: slugId(ctx.instanceId, "arrow-link"),
    open: slugId(ctx.instanceId, "arrow-open"),
  };
}

/** Arrow markers, always defined together — style-guide.md § Arrow markers. */
export function arrowMarkerDefs(ctx: RenderContext): string {
  const ids = markerIds(ctx);
  const t = ctx.theme;
  return `
    <marker id="${ids.default}" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="${t.muted}"/>
    </marker>
    <marker id="${ids.accent}" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="${t.accent}"/>
    </marker>
    <marker id="${ids.link}" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="${t.link}"/>
    </marker>
    <marker id="${ids.open}" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polyline points="0 0, 8 3, 0 6" fill="none" stroke="${t.muted}" stroke-width="1.2"/>
    </marker>`;
}

/** Accessible-SVG contract: <title> is the first child, before <defs>; both
 * <title>/<desc> get per-instance-prefixed ids so repeated inline diagrams on
 * one page never collide. */
export function svgWrapper(
  ctx: RenderContext,
  width: number,
  height: number,
  title: string,
  description: string,
  body: string,
): string {
  const titleId = slugId(ctx.instanceId, "title");
  const descId = slugId(ctx.instanceId, "desc");
  return [
    `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="${titleId} ${descId}" font-family="${ctx.theme.fontSans}">`,
    `<title id="${titleId}">${escapeXml(title)}</title>`,
    `<desc id="${descId}">${escapeXml(description)}</desc>`,
    `<defs>${arrowMarkerDefs(ctx)}</defs>`,
    `<rect width="100%" height="100%" fill="${ctx.theme.paper}"/>`,
    body,
    `</svg>`,
  ].join("\n");
}

export type NodeTreatment =
  | "focal"
  | "backend"
  | "store"
  | "external"
  | "input"
  | "optional"
  | "security"
  | "plain";

function treatmentFill(t: Theme, treatment: NodeTreatment): string {
  switch (treatment) {
    case "focal":
      return t.accentTint;
    case "store":
      return t.inkAt(0.05);
    case "external":
      return t.inkAt(0.03);
    case "input":
      return `hsl(var(--muted-foreground) / 0.10)`;
    case "optional":
      return t.inkAt(0.02);
    case "security":
      return `hsl(var(--accent) / 0.05)`;
    default:
      return t.paper;
  }
}

function treatmentStroke(t: Theme, treatment: NodeTreatment): { stroke: string; dash?: string } {
  switch (treatment) {
    case "focal":
      return { stroke: t.accent };
    case "store":
      return { stroke: t.muted };
    case "external":
      return { stroke: t.inkAt(0.3) };
    case "input":
      return { stroke: t.soft };
    case "optional":
      return { stroke: t.inkAt(0.2), dash: "4,3" };
    case "security":
      return { stroke: `hsl(var(--accent) / 0.5)`, dash: "4,4" };
    default:
      return { stroke: t.ink };
  }
}

/** Node-box full pattern from style-guide.md: opaque mask, styled box, optional
 * type tag, name (sans), optional sublabel (mono). */
export function nodeBox(
  ctx: RenderContext,
  box: { x: number; y: number; width: number; height: number; radius?: number },
  name: string,
  opts: { treatment?: NodeTreatment; sublabel?: string; tag?: string } = {},
): string {
  const t = ctx.theme;
  const treatment = opts.treatment ?? "plain";
  const { x, y, width, height } = box;
  const radius = box.radius ?? SPACING.radiusMd;
  const { stroke, dash } = treatmentStroke(t, treatment);
  const fill = treatmentFill(t, treatment);
  const cx = x + width / 2;
  const cy = y + height / 2;

  const parts: string[] = [
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${t.paper}"/>`,
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${SPACING.strokeDefault}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`,
  ];

  if (opts.tag) {
    const tagWidth = Math.max(24, opts.tag.length * 6 + 8);
    parts.push(
      `<rect x="${x + 8}" y="${y + 6}" width="${tagWidth}" height="12" rx="${SPACING.radiusSm - 2}" fill="transparent" stroke="${stroke}" stroke-width="${SPACING.strokeThin}"/>`,
      `<text x="${x + 8 + tagWidth / 2}" y="${y + 15}" fill="${stroke}" font-size="${TYPE_SCALE.eyebrow}" font-family="${t.fontMono}" text-anchor="middle" letter-spacing="0.08em">${escapeXml(opts.tag)}</text>`,
    );
  }

  const nameY = opts.sublabel ? cy - 2 : cy + 4;
  parts.push(
    `<text x="${cx}" y="${nameY}" fill="${t.ink}" font-size="${TYPE_SCALE.nodeName}" font-weight="600" font-family="${t.fontSans}" text-anchor="middle">${escapeXml(name)}</text>`,
  );
  if (opts.sublabel) {
    parts.push(
      `<text x="${cx}" y="${cy + 14}" fill="${t.muted}" font-size="${TYPE_SCALE.sublabel}" font-family="${t.fontMono}" text-anchor="middle">${escapeXml(opts.sublabel)}</text>`,
    );
  }
  return parts.join("\n");
}

/** Arrow-label with mandatory opaque mask and 6-10px gap above the stroke —
 * style-guide.md § Arrow labels. */
export function arrowLabel(ctx: RenderContext, centerX: number, strokeY: number, text: string): string {
  const mask = labelMask(centerX, strokeY, text);
  const t = ctx.theme;
  return [
    `<rect x="${mask.x}" y="${mask.y}" width="${mask.width}" height="${mask.height}" rx="${SPACING.radiusSm - 2}" fill="${t.paper}"/>`,
    `<text x="${centerX}" y="${mask.y + mask.height - 3}" fill="${t.soft}" font-size="${TYPE_SCALE.arrowLabel}" font-family="${t.fontMono}" text-anchor="middle" letter-spacing="0.06em">${escapeXml(text)}</text>`,
  ].join("\n");
}

export function connector(
  ctx: RenderContext,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { marker?: keyof ReturnType<typeof markerIds>; dash?: string; strokeOverride?: string } = {},
): string {
  const ids = markerIds(ctx);
  const marker = opts.marker ?? "default";
  const stroke = opts.strokeOverride ?? (marker === "accent" ? ctx.theme.accent : marker === "link" ? ctx.theme.link : ctx.theme.muted);
  const d = orthogonalPath(x1, y1, x2, y2);
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${SPACING.strokeDefault}"${opts.dash ? ` stroke-dasharray="${opts.dash}"` : ""} marker-end="url(#${ids[marker]})"/>`;
}

export { theme };
