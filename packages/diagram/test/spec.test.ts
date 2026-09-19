import { describe, expect, it } from "vitest";
import { DiagramSpecSchema } from "../src/spec.js";
import { erFixture, flowchartFixture, sequenceFixture, stateFixture } from "./fixtures.js";

describe("DiagramSpecSchema — valid fixtures", () => {
  it("accepts the sequence fixture", () => {
    expect(DiagramSpecSchema.safeParse(sequenceFixture).success).toBe(true);
  });
  it("accepts the flowchart fixture", () => {
    expect(DiagramSpecSchema.safeParse(flowchartFixture).success).toBe(true);
  });
  it("accepts the state fixture", () => {
    expect(DiagramSpecSchema.safeParse(stateFixture).success).toBe(true);
  });
  it("accepts the ER fixture", () => {
    expect(DiagramSpecSchema.safeParse(erFixture).success).toBe(true);
  });
});

describe("DiagramSpecSchema — complexity budgets (SKILL.md §7)", () => {
  it("rejects more than 5 sequence actors", () => {
    const spec = {
      ...sequenceFixture,
      actors: Array.from({ length: 6 }, (_, i) => ({ id: `a${i}`, name: `Actor ${i}` })),
    };
    expect(DiagramSpecSchema.safeParse(spec).success).toBe(false);
  });

  it("rejects more than 12 sequence messages total", () => {
    const spec = {
      type: "sequence" as const,
      actors: [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      items: Array.from({ length: 13 }, (_, i) => ({
        kind: "message" as const,
        message: { from: "a", to: "b", kind: "call" as const, label: `m${i}`, headline: false },
      })),
    };
    expect(DiagramSpecSchema.safeParse(spec).success).toBe(false);
  });

  it("rejects a second alt fragment (max 1 combined fragment by default)", () => {
    const alt = sequenceFixture.items.find((i) => i.kind === "fragment")!;
    const spec = { ...sequenceFixture, items: [...sequenceFixture.items, alt] };
    expect(DiagramSpecSchema.safeParse(spec).success).toBe(false);
  });

  it("rejects more than 2 headline messages in a sequence", () => {
    const spec = {
      type: "sequence" as const,
      actors: [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      items: [1, 2, 3].map((i) => ({
        kind: "message" as const,
        message: { from: "a", to: "b", kind: "call" as const, label: `m${i}`, headline: true },
      })),
    };
    expect(DiagramSpecSchema.safeParse(spec).success).toBe(false);
  });

  it("rejects more than 9 flowchart nodes", () => {
    const nodes = Array.from({ length: 10 }, (_, i) => ({
      id: `n${i}`,
      kind: "step" as const,
      label: `Step ${i}`,
      headline: false,
    }));
    const spec = {
      type: "flowchart" as const,
      nodes,
      edges: [{ from: "n0", to: "n1" }],
    };
    expect(DiagramSpecSchema.safeParse(spec).success).toBe(false);
  });

  it("rejects a decision with more than 3 exits", () => {
    const spec = {
      type: "flowchart" as const,
      nodes: [
        { id: "d", kind: "decision" as const, label: "Which?", headline: false },
        { id: "a", kind: "step" as const, label: "A", headline: false },
        { id: "b", kind: "step" as const, label: "B", headline: false },
        { id: "c", kind: "step" as const, label: "C", headline: false },
        { id: "e", kind: "step" as const, label: "E", headline: false },
      ],
      edges: [
        { from: "d", to: "a" },
        { from: "d", to: "b" },
        { from: "d", to: "c" },
        { from: "d", to: "e" },
      ],
    };
    expect(DiagramSpecSchema.safeParse(spec).success).toBe(false);
  });

  it("rejects more than 8 ER entities", () => {
    const spec = {
      type: "er" as const,
      entities: Array.from({ length: 9 }, (_, i) => ({
        id: `e${i}`,
        name: `Entity ${i}`,
        headline: false,
        fields: [{ name: "id", type: "uuid", pk: true, fk: false }],
      })),
      relationships: [],
    };
    expect(DiagramSpecSchema.safeParse(spec).success).toBe(false);
  });

  it("rejects a relationship referencing an unknown entity id", () => {
    const spec = {
      ...erFixture,
      relationships: [{ from: "customer", to: "ghost", cardinality: "one-to-many" as const }],
    };
    expect(DiagramSpecSchema.safeParse(spec).success).toBe(false);
  });
});
