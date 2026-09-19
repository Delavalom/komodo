import type { StateSpec } from "../spec.js";
import { snap, SPACING } from "../theme.js";

export interface StateNodeLayout {
  id: string;
  label: string;
  initial: boolean;
  final: boolean;
  headline: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StateTransitionLayout {
  from: { x: number; y: number };
  to: { x: number; y: number };
  label?: string;
  /** Self-transition (from === to), drawn as a small loop, not a connector. */
  isSelf: boolean;
}

export interface StateLayout {
  width: number;
  height: number;
  states: StateNodeLayout[];
  transitions: StateTransitionLayout[];
}

const NODE_WIDTH = 128;
const NODE_HEIGHT = 48;
const ROW_GAP = 96;

/** BFS distance from the initial state — states unreachable from it (e.g. an
 * error state entered from multiple places) settle at the shortest distance
 * found along any transition. */
function computeRanks(spec: StateSpec): Map<string, number> {
  const initial = spec.states.find((s) => s.initial) ?? spec.states[0];
  const ranks = new Map<string, number>([[initial.id, 0]]);
  const queue = [initial.id];
  while (queue.length) {
    const current = queue.shift()!;
    const rank = ranks.get(current)!;
    for (const t of spec.transitions) {
      if (t.from !== current || t.to === current) continue;
      if (!ranks.has(t.to)) {
        ranks.set(t.to, rank + 1);
        queue.push(t.to);
      }
    }
  }
  for (const state of spec.states) if (!ranks.has(state.id)) ranks.set(state.id, ranks.size);
  return ranks;
}

export function layoutState(spec: StateSpec): StateLayout {
  const ranks = computeRanks(spec);
  const byRank = new Map<number, typeof spec.states>();
  for (const state of spec.states) {
    const rank = ranks.get(state.id) ?? 0;
    byRank.set(rank, [...(byRank.get(rank) ?? []), state]);
  }

  const positions = new Map<string, StateNodeLayout>();
  const maxRank = Math.max(0, ...byRank.keys());
  let maxWidth = 0;

  for (let rank = 0; rank <= maxRank; rank++) {
    const rowStates = byRank.get(rank) ?? [];
    const rowWidth = rowStates.length * NODE_WIDTH + SPACING.nodeGap * Math.max(0, rowStates.length - 1);
    maxWidth = Math.max(maxWidth, rowWidth);
    const y = snap(SPACING.outerMargin + rank * ROW_GAP);
    rowStates.forEach((state, i) => {
      const x = snap(SPACING.outerMargin + i * (NODE_WIDTH + SPACING.nodeGap));
      positions.set(state.id, {
        id: state.id,
        label: state.label,
        initial: state.initial,
        final: state.final,
        headline: state.headline,
        x,
        y,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      });
    });
  }

  for (const rowStates of byRank.values()) {
    const rowWidth = rowStates.length * NODE_WIDTH + SPACING.nodeGap * Math.max(0, rowStates.length - 1);
    const offset = snap((maxWidth - rowWidth) / 2);
    for (const state of rowStates) {
      const layout = positions.get(state.id)!;
      layout.x = snap(layout.x + offset);
    }
  }

  const transitions: StateTransitionLayout[] = spec.transitions.map((t) => {
    const from = positions.get(t.from)!;
    const to = positions.get(t.to)!;
    const isSelf = t.from === t.to;
    return {
      isSelf,
      label: t.guard ? `${t.label ?? ""} [${t.guard}]`.trim() : t.label,
      from: { x: snap(from.x + from.width / 2), y: from.y + from.height },
      to: isSelf
        ? { x: snap(to.x + to.width / 2), y: to.y + to.height }
        : { x: snap(to.x + to.width / 2), y: to.y },
    };
  });

  const width = snap(maxWidth + SPACING.outerMargin * 2);
  const height = snap(SPACING.outerMargin * 2 + maxRank * ROW_GAP + 80);

  return { width, height, states: [...positions.values()], transitions };
}
