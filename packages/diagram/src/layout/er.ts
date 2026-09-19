import type { ErSpec } from "../spec.js";
import { snap, SPACING } from "../theme.js";

export interface ErFieldLayout {
  name: string;
  type?: string;
  pk: boolean;
  fk: boolean;
}

export interface ErEntityLayout {
  id: string;
  name: string;
  headline: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  fields: ErFieldLayout[];
}

export interface ErRelationshipLayout {
  from: { x: number; y: number };
  to: { x: number; y: number };
  label?: string;
  cardinality: "one-to-one" | "one-to-many" | "many-to-many";
}

export interface ErLayout {
  width: number;
  height: number;
  entities: ErEntityLayout[];
  relationships: ErRelationshipLayout[];
}

const ENTITY_WIDTH = 160;
const HEADER_HEIGHT = 28;
const FIELD_ROW_HEIGHT = 20;
const ENTITIES_PER_ROW = 3;

export function layoutEr(spec: ErSpec): ErLayout {
  const positions = new Map<string, ErEntityLayout>();
  const rowHeights: number[] = [];

  spec.entities.forEach((entity, i) => {
    const row = Math.floor(i / ENTITIES_PER_ROW);
    const col = i % ENTITIES_PER_ROW;
    const height = snap(HEADER_HEIGHT + entity.fields.length * FIELD_ROW_HEIGHT + 8);
    rowHeights[row] = Math.max(rowHeights[row] ?? 0, height);
    positions.set(entity.id, {
      id: entity.id,
      name: entity.name,
      headline: entity.headline,
      x: snap(SPACING.outerMargin + col * (ENTITY_WIDTH + SPACING.nodeGap)),
      y: 0, // filled in below once row heights are known
      width: ENTITY_WIDTH,
      height,
      fields: entity.fields.map((f) => ({ name: f.name, type: f.type, pk: f.pk, fk: f.fk })),
    });
  });

  const rowYs: number[] = [];
  let cursorY = SPACING.outerMargin;
  rowHeights.forEach((h, row) => {
    rowYs[row] = cursorY;
    cursorY += h + SPACING.nodeGap;
  });
  spec.entities.forEach((entity, i) => {
    const row = Math.floor(i / ENTITIES_PER_ROW);
    positions.get(entity.id)!.y = snap(rowYs[row]);
  });

  const relationships: ErRelationshipLayout[] = spec.relationships.map((rel) => {
    const from = positions.get(rel.from)!;
    const to = positions.get(rel.to)!;
    const fromCenter = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
    const toCenter = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
    // Attach on the nearer vertical edge when rows differ, else the bottom edge.
    const fromPoint =
      from.y === to.y
        ? { x: snap(from.x + (toCenter.x > fromCenter.x ? from.width : 0)), y: snap(from.y + from.height / 2) }
        : { x: snap(from.x + from.width / 2), y: snap(from.y + from.height) };
    const toPoint =
      from.y === to.y
        ? { x: snap(to.x + (toCenter.x > fromCenter.x ? 0 : to.width)), y: snap(to.y + to.height / 2) }
        : { x: snap(to.x + to.width / 2), y: snap(to.y) };
    return { from: fromPoint, to: toPoint, label: rel.label, cardinality: rel.cardinality };
  });

  const cols = Math.min(spec.entities.length, ENTITIES_PER_ROW);
  const width = snap(SPACING.outerMargin * 2 + cols * ENTITY_WIDTH + (cols - 1) * SPACING.nodeGap);
  const height = snap(cursorY + SPACING.outerMargin);

  return { width, height, entities: [...positions.values()], relationships };
}
