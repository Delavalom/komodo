import type { StateLayout, StateNodeLayout } from "../layout/state.js";
import { escapeXml } from "../geometry.js";
import { SPACING, TYPE_SCALE } from "../theme.js";
import { arrowLabel, connector, markerIds, svgWrapper, type RenderContext } from "./shared.js";

function renderState(ctx: RenderContext, state: StateNodeLayout): string {
  const t = ctx.theme;
  const { x, y, width, height } = state;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const stroke = state.headline ? t.accent : t.ink;
  const fill = state.headline ? t.accentTint : t.paper;
  const parts: string[] = [
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${SPACING.radiusLg}" fill="${fill}" stroke="${stroke}" stroke-width="${SPACING.strokeDefault}"/>`,
  ];
  if (state.final) {
    parts.push(
      `<rect x="${x + 4}" y="${y + 4}" width="${width - 8}" height="${height - 8}" rx="${SPACING.radiusMd}" fill="none" stroke="${stroke}" stroke-width="${SPACING.strokeThin}"/>`,
    );
  }
  if (state.initial) {
    parts.push(`<circle cx="${x - 12}" cy="${cy}" r="4" fill="${t.ink}"/>`);
    parts.push(`<line x1="${x - 8}" y1="${cy}" x2="${x}" y2="${cy}" stroke="${t.ink}" stroke-width="${SPACING.strokeDefault}"/>`);
  }
  parts.push(
    `<text x="${cx}" y="${cy + 4}" fill="${t.ink}" font-size="${TYPE_SCALE.nodeName}" font-weight="600" font-family="${t.fontSans}" text-anchor="middle">${escapeXml(state.label)}</text>`,
  );
  return parts.join("\n");
}

export function renderState_(ctx: RenderContext, layout: StateLayout): string {
  const parts: string[] = [];

  for (const transition of layout.transitions) {
    if (transition.isSelf) {
      const loopX = transition.from.x + 40;
      const d = `M ${transition.from.x} ${transition.from.y} L ${loopX} ${transition.from.y} L ${loopX} ${transition.to.y} L ${transition.to.x} ${transition.to.y}`;
      parts.push(`<path d="${d}" fill="none" stroke="${ctx.theme.muted}" stroke-width="${SPACING.strokeDefault}" marker-end="url(#${markerIds(ctx).default})"/>`);
    } else {
      parts.push(connector(ctx, transition.from.x, transition.from.y, transition.to.x, transition.to.y));
    }
    if (transition.label) {
      parts.push(arrowLabel(ctx, (transition.from.x + transition.to.x) / 2, Math.max(transition.from.y, transition.to.y), transition.label));
    }
  }

  for (const state of layout.states) parts.push(renderState(ctx, state));

  return parts.join("\n");
}

export function renderStateDiagram(ctx: RenderContext, layout: StateLayout, title: string, description: string): string {
  return svgWrapper(ctx, layout.width, layout.height, title, description, renderState_(ctx, layout));
}
