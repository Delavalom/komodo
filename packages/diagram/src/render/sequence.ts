import type { SequenceLayout, SequenceMessageLayout, SequenceRowLayout } from "../layout/sequence.js";
import { escapeXml } from "../geometry.js";
import { SPACING, TYPE_SCALE } from "../theme.js";
import { arrowLabel, connector, markerIds, nodeBox, svgWrapper, type RenderContext } from "./shared.js";

interface ActivationBar {
  actorX: number;
  top: number;
  bottom: number;
}

function flattenMessages(rows: SequenceRowLayout[]): SequenceMessageLayout[] {
  return rows.flatMap((row) => (row.kind === "message" ? [row.message] : row.fragment.messages));
}

/** Matches each return to the nearest still-open call on that lifeline, so a
 * nested call sequence gets a stacked activation bar per style-guide.md's
 * "activation bar" primitive, rather than one bar per message. */
function computeActivationBars(layout: SequenceLayout): ActivationBar[] {
  const messages = flattenMessages(layout.rows);
  const openByX = new Map<number, number[]>();
  const bars: ActivationBar[] = [];

  for (const message of messages) {
    if (message.isSelf) continue;
    if (message.kind === "call") {
      const stack = openByX.get(message.toX) ?? [];
      stack.push(message.y);
      openByX.set(message.toX, stack);
    } else if (message.kind === "return") {
      const stack = openByX.get(message.fromX);
      const start = stack?.pop();
      if (start !== undefined) bars.push({ actorX: message.fromX, top: start, bottom: message.y });
    }
  }
  for (const [x, stack] of openByX) {
    for (const start of stack) bars.push({ actorX: x, top: start, bottom: layout.lifelineBottom });
  }
  return bars;
}

function renderMessage(ctx: RenderContext, message: SequenceMessageLayout): string {
  const t = ctx.theme;
  if (message.isSelf) {
    const loopWidth = 32;
    const d = `M ${message.fromX} ${message.y} L ${message.fromX + loopWidth} ${message.y} L ${message.fromX + loopWidth} ${message.y + 16} L ${message.fromX} ${message.y + 16}`;
    return [
      `<path d="${d}" fill="none" stroke="${t.muted}" stroke-width="${SPACING.strokeDefault}" marker-end="url(#${markerIds(ctx).default})"/>`,
      arrowLabel(ctx, message.fromX + loopWidth + 20, message.y + 8, message.label),
    ].join("\n");
  }

  const marker = message.headline ? "accent" : message.kind === "async" ? "open" : "default";
  // Headline success is always solid — style-guide.md's return/async dashing
  // is for the ordinary case and yields to the "headline" treatment.
  const dash = !message.headline && (message.kind === "return" || message.kind === "async") ? "5,4" : undefined;
  return [
    connector(ctx, message.fromX, message.y, message.toX, message.y, { marker, dash }),
    arrowLabel(ctx, (message.fromX + message.toX) / 2, message.y, message.label),
  ].join("\n");
}

export function renderSequence(ctx: RenderContext, layout: SequenceLayout): string {
  const t = ctx.theme;
  const parts: string[] = [];

  // 1. Lifelines (dashed verticals) — drawn first, per "arrows before boxes".
  for (const actor of layout.actors) {
    parts.push(
      `<line x1="${actor.x}" y1="${layout.lifelineTop}" x2="${actor.x}" y2="${layout.lifelineBottom}" stroke="${t.inkAt(0.2)}" stroke-width="${SPACING.strokeDefault}" stroke-dasharray="3,3"/>`,
    );
  }

  // 2. Activation bars.
  for (const bar of computeActivationBars(layout)) {
    parts.push(
      `<rect x="${bar.actorX - 4}" y="${bar.top}" width="8" height="${Math.max(8, bar.bottom - bar.top)}" fill="${t.inkAt(0.06)}" stroke="${t.muted}" stroke-width="${SPACING.strokeThin}"/>`,
    );
  }

  // 3. Fragment frames + their nested messages, then top-level messages, in order.
  for (const row of layout.rows) {
    if (row.kind === "message") {
      parts.push(renderMessage(ctx, row.message));
      continue;
    }
    const f = row.fragment;
    parts.push(
      `<rect x="${f.x}" y="${f.y}" width="${f.width}" height="${f.height}" rx="4" fill="${t.inkAt(0.02)}" stroke="${t.inkAt(0.22)}" stroke-width="${SPACING.strokeDefault}"/>`,
      `<rect x="${f.x}" y="${f.y}" width="40" height="16" rx="2" fill="${t.paper}" stroke="${t.inkAt(0.22)}" stroke-width="${SPACING.strokeDefault}"/>`,
      `<text x="${f.x + 20}" y="${f.y + 12}" fill="${t.muted}" font-size="${TYPE_SCALE.eyebrow}" font-family="${t.fontMono}" text-anchor="middle" letter-spacing="0.12em">${escapeXml(f.tag)}</text>`,
    );
    for (const guard of f.guards) {
      parts.push(
        `<text x="${f.x + 12}" y="${guard.y}" fill="${t.muted}" font-size="${TYPE_SCALE.arrowLabel}" font-family="${t.fontMono}" letter-spacing="0.04em">[${escapeXml(guard.label)}]</text>`,
      );
    }
    if (f.dividerY !== null) {
      parts.push(
        `<line x1="${f.x + 8}" y1="${f.dividerY}" x2="${f.x + f.width - 8}" y2="${f.dividerY}" stroke="${t.inkAt(0.2)}" stroke-width="${SPACING.strokeDefault}" stroke-dasharray="4,3"/>`,
      );
    }
    for (const message of f.messages) parts.push(renderMessage(ctx, message));
  }

  // 4. Actor boxes on top, so their opaque mask covers the lifeline start.
  for (const actor of layout.actors) {
    parts.push(
      nodeBox(
        ctx,
        { x: actor.x - 60, y: layout.actorBoxTop, width: 120, height: layout.actorBoxHeight },
        actor.name,
      ),
    );
  }

  return parts.join("\n");
}

export function renderSequenceDiagram(ctx: RenderContext, layout: SequenceLayout, title: string, description: string): string {
  return svgWrapper(ctx, layout.width, layout.height, title, description, renderSequence(ctx, layout));
}
