import type { FlowchartSpec } from "../spec.js";
import { snap, SPACING } from "../theme.js";

export interface FlowchartNodeLayout {
  id: string;
  kind: "start" | "end" | "step" | "decision";
  label: string;
  headline: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FlowchartEdgeLayout {
  from: { x: number; y: number };
  to: { x: number; y: number };
  label?: string;
}

export interface FlowchartLayout {
  width: number;
  height: number;
  nodes: FlowchartNodeLayout[];
  edges: FlowchartEdgeLayout[];
}

const ROW_GAP = 96;

function sizeFor(kind: FlowchartNodeLayout["kind"]): { width: number; height: number } {
  if (kind === "decision") return { width: 140, height: 80 };
  if (kind === "start" || kind === "end") return { width: 112, height: 48 };
  return { width: 140, height: 48 };
}

/** Longest-path-from-root layering — a small, dependency-free stand-in for a
 * full Sugiyama layout, sufficient at the skill's own budget (max 9 nodes). */
function computeRanks(spec: FlowchartSpec): Map<string, number> {
  const incoming = new Map<string, number>();
  for (const node of spec.nodes) incoming.set(node.id, 0);
  for (const edge of spec.edges) incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);

  const ranks = new Map<string, number>();
  const roots = spec.nodes.filter((n) => (incoming.get(n.id) ?? 0) === 0);
  for (const root of roots.length ? roots : [spec.nodes[0]]) ranks.set(root.id, 0);

  // Relax repeatedly (bounded by node count) so any topological order settles.
  for (let pass = 0; pass < spec.nodes.length + 1; pass++) {
    for (const edge of spec.edges) {
      const fromRank = ranks.get(edge.from);
      if (fromRank === undefined) continue;
      const candidate = fromRank + 1;
      const current = ranks.get(edge.to);
      if (current === undefined || candidate > current) ranks.set(edge.to, candidate);
    }
  }
  for (const node of spec.nodes) if (!ranks.has(node.id)) ranks.set(node.id, 0);
  return ranks;
}

export function layoutFlowchart(spec: FlowchartSpec): FlowchartLayout {
  const ranks = computeRanks(spec);
  const byRank = new Map<number, typeof spec.nodes>();
  for (const node of spec.nodes) {
    const rank = ranks.get(node.id) ?? 0;
    byRank.set(rank, [...(byRank.get(rank) ?? []), node]);
  }

  const positions = new Map<string, FlowchartNodeLayout>();
  const maxRank = Math.max(0, ...byRank.keys());
  let maxWidth = 0;

  for (let rank = 0; rank <= maxRank; rank++) {
    const rowNodes = byRank.get(rank) ?? [];
    const sizes = rowNodes.map((n) => sizeFor(n.kind));
    const rowWidth = sizes.reduce((sum, s) => sum + s.width, 0) + SPACING.nodeGap * Math.max(0, rowNodes.length - 1);
    maxWidth = Math.max(maxWidth, rowWidth);
    let cursorX = SPACING.outerMargin;
    const y = snap(SPACING.outerMargin + rank * ROW_GAP);
    rowNodes.forEach((node, i) => {
      const { width, height } = sizes[i];
      positions.set(node.id, {
        id: node.id,
        kind: node.kind,
        label: node.label,
        headline: node.headline,
        x: snap(cursorX),
        y,
        width: snap(width),
        height: snap(height),
      });
      cursorX += width + SPACING.nodeGap;
    });
  }

  // Center shorter rows against the widest row.
  for (const rowNodes of byRank.values()) {
    const rowWidth =
      rowNodes.reduce((sum, n) => sum + sizeFor(n.kind).width, 0) +
      SPACING.nodeGap * Math.max(0, rowNodes.length - 1);
    const offset = snap((maxWidth - rowWidth) / 2);
    for (const node of rowNodes) {
      const layout = positions.get(node.id)!;
      layout.x = snap(layout.x + offset);
    }
  }

  const edges: FlowchartEdgeLayout[] = spec.edges.map((edge) => {
    const from = positions.get(edge.from)!;
    const to = positions.get(edge.to)!;
    const sameColumn = from.x + from.width / 2 === to.x + to.width / 2;
    return {
      from: { x: snap(from.x + from.width / 2), y: from.y + from.height },
      to: sameColumn
        ? { x: snap(to.x + to.width / 2), y: to.y }
        : { x: snap(to.x + to.width / 2), y: to.y },
      label: edge.label,
    };
  });

  const width = snap(maxWidth + SPACING.outerMargin * 2);
  const height = snap(SPACING.outerMargin * 2 + maxRank * ROW_GAP + 80);

  return { width, height, nodes: [...positions.values()], edges };
}
