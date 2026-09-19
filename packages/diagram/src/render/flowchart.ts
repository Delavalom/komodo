import type { FlowchartLayout, FlowchartNodeLayout } from "../layout/flowchart.js";
import { escapeXml } from "../geometry.js";
import { SPACING, TYPE_SCALE } from "../theme.js";
import { arrowLabel, connector, svgWrapper, type RenderContext } from "./shared.js";

/** Flowchart shapes carry the node's type — never fill color (SKILL.md
 * type-flowchart.md: "Shape carries type, not color"). */
function renderNode(ctx: RenderContext, node: FlowchartNodeLayout): string {
  const t = ctx.theme;
  const { x, y, width, height } = node;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const stroke = node.headline ? t.accent : t.ink;
  const fill = node.headline ? t.accentTint : t.paper;
  const parts: string[] = [];

  if (node.kind === "start" || node.kind === "end") {
    parts.push(
      `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${height / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${SPACING.strokeDefault}"/>`,
    );
  } else if (node.kind === "decision") {
    const points = [
      [cx, y],
      [x + width, cy],
      [cx, y + height],
      [x, cy],
    ]
      .map(([px, py]) => `${px},${py}`)
      .join(" ");
    parts.push(`<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="${SPACING.strokeDefault}"/>`);
  } else {
    parts.push(
      `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${SPACING.radiusMd}" fill="${fill}" stroke="${stroke}" stroke-width="${SPACING.strokeDefault}"/>`,
    );
  }

  parts.push(
    `<text x="${cx}" y="${cy + 4}" fill="${t.ink}" font-size="${TYPE_SCALE.nodeName}" font-weight="600" font-family="${t.fontSans}" text-anchor="middle">${escapeXml(node.label)}</text>`,
  );
  return parts.join("\n");
}

export function renderFlowchart(ctx: RenderContext, layout: FlowchartLayout): string {
  const parts: string[] = [];

  // Arrows before boxes.
  for (const edge of layout.edges) {
    parts.push(connector(ctx, edge.from.x, edge.from.y, edge.to.x, edge.to.y));
    if (edge.label) {
      parts.push(arrowLabel(ctx, (edge.from.x + edge.to.x) / 2, Math.max(edge.from.y, edge.to.y), edge.label));
    }
  }

  for (const node of layout.nodes) parts.push(renderNode(ctx, node));

  return parts.join("\n");
}

export function renderFlowchartDiagram(
  ctx: RenderContext,
  layout: FlowchartLayout,
  title: string,
  description: string,
): string {
  return svgWrapper(ctx, layout.width, layout.height, title, description, renderFlowchart(ctx, layout));
}
