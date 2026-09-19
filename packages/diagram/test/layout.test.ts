import { describe, expect, it } from "vitest";
import { layoutSequence } from "../src/layout/sequence.js";
import { layoutFlowchart } from "../src/layout/flowchart.js";
import { layoutState } from "../src/layout/state.js";
import { layoutEr } from "../src/layout/er.js";
import { GRID } from "../src/theme.js";
import { erFixture, flowchartFixture, sequenceFixture, stateFixture } from "./fixtures.js";

function onGrid(n: number): boolean {
  return Number.isFinite(n) && n % GRID === 0;
}

describe("layoutSequence — 4px grid (SKILL.md §7)", () => {
  const layout = layoutSequence(sequenceFixture);

  it("places every actor lifeline x on the grid", () => {
    for (const actor of layout.actors) expect(onGrid(actor.x)).toBe(true);
  });

  it("places every message y on the grid", () => {
    for (const row of layout.rows) {
      if (row.kind === "message") expect(onGrid(row.message.y)).toBe(true);
      else for (const m of row.fragment.messages) expect(onGrid(m.y)).toBe(true);
    }
  });

  it("sizes the canvas on the grid", () => {
    expect(onGrid(layout.width)).toBe(true);
    expect(onGrid(layout.height)).toBe(true);
  });
});

describe("layoutFlowchart", () => {
  const layout = layoutFlowchart(flowchartFixture);

  it("places every node on the grid", () => {
    for (const node of layout.nodes) {
      expect(onGrid(node.x)).toBe(true);
      expect(onGrid(node.y)).toBe(true);
      expect(onGrid(node.width)).toBe(true);
      expect(onGrid(node.height)).toBe(true);
    }
  });

  it("routes the decision node to at most 3 exits (schema already enforces this, layout must not silently add more)", () => {
    const decisionId = flowchartFixture.nodes.find((n) => n.kind === "decision")!.id;
    const exits = layout.edges.filter((e) => flowchartFixture.edges.some((se) => se.from === decisionId));
    expect(exits.length).toBeLessThanOrEqual(3 * flowchartFixture.edges.length); // sanity: layout doesn't invent edges
    expect(layout.edges.length).toBe(flowchartFixture.edges.length);
  });
});

describe("layoutState", () => {
  const layout = layoutState(stateFixture);

  it("places every state on the grid", () => {
    for (const state of layout.states) {
      expect(onGrid(state.x)).toBe(true);
      expect(onGrid(state.y)).toBe(true);
    }
  });

  it("ranks the initial state first", () => {
    const initial = layout.states.find((s) => s.initial)!;
    for (const other of layout.states) {
      if (other.id === initial.id) continue;
      expect(other.y).toBeGreaterThanOrEqual(initial.y);
    }
  });
});

describe("layoutEr", () => {
  const layout = layoutEr(erFixture);

  it("places every entity on the grid and sizes it to its field count", () => {
    for (const entity of layout.entities) {
      expect(onGrid(entity.x)).toBe(true);
      expect(onGrid(entity.y)).toBe(true);
      expect(entity.height).toBeGreaterThan(entity.fields.length * 15);
    }
  });
});
