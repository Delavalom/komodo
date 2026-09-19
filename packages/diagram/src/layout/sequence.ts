import type { SequenceMessage, SequenceSpec } from "../spec.js";
import { snap, SPACING } from "../theme.js";

export interface SequenceMessageLayout {
  y: number;
  fromX: number;
  toX: number;
  label: string;
  kind: "call" | "return" | "async";
  headline: boolean;
  /** Self-message (from === to): drawn as a U-shaped loop instead of a line. */
  isSelf: boolean;
}

export interface SequenceFragmentLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  tag: string;
  guards: { label: string; y: number }[];
  dividerY: number | null;
  messages: SequenceMessageLayout[];
}

export type SequenceRowLayout =
  | { kind: "message"; message: SequenceMessageLayout }
  | { kind: "fragment"; fragment: SequenceFragmentLayout };

export interface SequenceLayout {
  width: number;
  height: number;
  actors: { id: string; name: string; x: number }[];
  actorBoxTop: number;
  actorBoxHeight: number;
  lifelineTop: number;
  lifelineBottom: number;
  rows: SequenceRowLayout[];
}

const ACTOR_BOX_WIDTH = 120;
const ACTOR_BOX_HEIGHT = 48;
const ROW_HEIGHT = 32;
const FRAGMENT_HEADER = 24;
const FRAGMENT_PADDING = 12;

export function layoutSequence(spec: SequenceSpec): SequenceLayout {
  const actorXs = new Map<string, number>();
  const actors = spec.actors.map((actor, i) => {
    const x = snap(SPACING.outerMargin + ACTOR_BOX_WIDTH / 2 + i * (ACTOR_BOX_WIDTH + SPACING.nodeGap));
    actorXs.set(actor.id, x);
    return { id: actor.id, name: actor.name, x };
  });

  const actorBoxTop = SPACING.outerMargin;
  const lifelineTop = actorBoxTop + ACTOR_BOX_HEIGHT + 16;

  let cursorY = lifelineTop + ROW_HEIGHT;
  const rows: SequenceRowLayout[] = [];

  const placeMessage = (message: SequenceMessage): SequenceMessageLayout => {
    const fromX = actorXs.get(message.from) ?? 0;
    const toX = actorXs.get(message.to) ?? 0;
    const layout: SequenceMessageLayout = {
      y: snap(cursorY),
      fromX,
      toX,
      label: message.label,
      kind: message.kind,
      headline: message.headline,
      isSelf: message.from === message.to,
    };
    cursorY += ROW_HEIGHT;
    return layout;
  };

  for (const item of spec.items) {
    if (item.kind === "message") {
      rows.push({ kind: "message", message: placeMessage(item.message) });
      continue;
    }

    const frameTop = snap(cursorY - ROW_HEIGHT / 2);
    cursorY += FRAGMENT_HEADER;
    const guards: { label: string; y: number }[] = [];
    const messages: SequenceMessageLayout[] = [];
    let dividerY: number | null = null;

    item.fragment.regions.forEach((region, regionIndex) => {
      if (region.guard) {
        guards.push({ label: region.guard, y: snap(cursorY) });
        cursorY += 20;
      }
      for (const message of region.messages) {
        messages.push(placeMessage(message));
      }
      if (regionIndex < item.fragment.regions.length - 1) {
        dividerY = snap(cursorY + ROW_HEIGHT / 2);
        cursorY += ROW_HEIGHT;
      }
    });

    cursorY += FRAGMENT_PADDING;
    const frameBottom = snap(cursorY);
    const participatingXs = messages.flatMap((m) => [m.fromX, m.toX]);
    const minX = Math.min(...participatingXs) - 24;
    const maxX = Math.max(...participatingXs) + 24;

    rows.push({
      kind: "fragment",
      fragment: {
        x: snap(minX),
        y: frameTop,
        width: snap(maxX - minX),
        height: frameBottom - frameTop,
        tag: item.fragment.kind.toUpperCase(),
        guards,
        dividerY,
        messages,
      },
    });
  }

  const lifelineBottom = snap(cursorY + 16);
  const width = snap(
    actors.length ? Math.max(...actors.map((a) => a.x)) + ACTOR_BOX_WIDTH / 2 + SPACING.outerMargin : 400,
  );
  const height = snap(lifelineBottom + ACTOR_BOX_HEIGHT + SPACING.outerMargin);

  return {
    width,
    height,
    actors,
    actorBoxTop,
    actorBoxHeight: ACTOR_BOX_HEIGHT,
    lifelineTop,
    lifelineBottom,
    rows,
  };
}

export const SEQUENCE_ACTOR_BOX_WIDTH = ACTOR_BOX_WIDTH;
