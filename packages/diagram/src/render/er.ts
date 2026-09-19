import type { ErEntityLayout, ErLayout } from "../layout/er.js";
import { escapeXml } from "../geometry.js";
import { SPACING, TYPE_SCALE } from "../theme.js";
import { arrowLabel, connector, svgWrapper, type RenderContext } from "./shared.js";

const HEADER_HEIGHT = 28;
const FIELD_ROW_HEIGHT = 20;

const CARDINALITY_LABEL: Record<ErLayout["relationships"][number]["cardinality"], string> = {
  "one-to-one": "1—1",
  "one-to-many": "1—N",
  "many-to-many": "N—N",
};

function renderEntity(ctx: RenderContext, entity: ErEntityLayout): string {
  const t = ctx.theme;
  const { x, y, width, height } = entity;
  const stroke = entity.headline ? t.accent : t.ink;
  const fill = entity.headline ? t.accentTint : t.paper;
  const parts: string[] = [
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${SPACING.radiusMd}" fill="${t.paper}"/>`,
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${SPACING.radiusMd}" fill="${fill}" stroke="${stroke}" stroke-width="${SPACING.strokeDefault}"/>`,
    `<line x1="${x}" y1="${y + HEADER_HEIGHT}" x2="${x + width}" y2="${y + HEADER_HEIGHT}" stroke="${stroke}" stroke-width="${SPACING.strokeThin}"/>`,
    `<text x="${x + width / 2}" y="${y + 18}" fill="${t.ink}" font-size="${TYPE_SCALE.nodeName}" font-weight="600" font-family="${t.fontSans}" text-anchor="middle">${escapeXml(entity.name)}</text>`,
  ];

  entity.fields.forEach((field, i) => {
    const rowY = y + HEADER_HEIGHT + i * FIELD_ROW_HEIGHT;
    const tag = field.pk ? "PK" : field.fk ? "FK" : "";
    parts.push(
      `<text x="${x + 10}" y="${rowY + 14}" fill="${t.ink}" font-size="${TYPE_SCALE.sublabel}" font-family="${t.fontMono}">${escapeXml(field.name)}</text>`,
    );
    if (tag) {
      parts.push(
        `<text x="${x + width - 10}" y="${rowY + 14}" fill="${t.muted}" font-size="${TYPE_SCALE.eyebrow}" font-family="${t.fontMono}" text-anchor="end" letter-spacing="0.06em">${tag}</text>`,
      );
    } else if (field.type) {
      parts.push(
        `<text x="${x + width - 10}" y="${rowY + 14}" fill="${t.muted}" font-size="${TYPE_SCALE.sublabel}" font-family="${t.fontMono}" text-anchor="end">${escapeXml(field.type)}</text>`,
      );
    }
  });

  return parts.join("\n");
}

export function renderEr(ctx: RenderContext, layout: ErLayout): string {
  const parts: string[] = [];

  for (const rel of layout.relationships) {
    parts.push(connector(ctx, rel.from.x, rel.from.y, rel.to.x, rel.to.y));
    const label = rel.label ? `${rel.label} (${CARDINALITY_LABEL[rel.cardinality]})` : CARDINALITY_LABEL[rel.cardinality];
    parts.push(arrowLabel(ctx, (rel.from.x + rel.to.x) / 2, (rel.from.y + rel.to.y) / 2, label));
  }

  for (const entity of layout.entities) parts.push(renderEntity(ctx, entity));

  return parts.join("\n");
}

export function renderErDiagram(ctx: RenderContext, layout: ErLayout, title: string, description: string): string {
  return svgWrapper(ctx, layout.width, layout.height, title, description, renderEr(ctx, layout));
}
