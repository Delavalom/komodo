import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { escapeXml } from "../src/geometry.js";
import { specToMermaid } from "../src/mermaid.js";
import { renderDiagram } from "../src/render.js";
import type { DiagramSpec, ErSpec, FlowchartSpec, StateSpec } from "../src/spec.js";
import { DiagramSpecSchema } from "../src/spec.js";

const RUNS = { seed: 20261017, numRuns: 300 };

/*
 * Specs are built to satisfy `DiagramSpecSchema` by construction, rather than
 * generated loosely and filtered with `fc.pre`: the schema's `superRefine`
 * rules (ids referenced only by existing nodes, headline budgets, decision
 * fan-out caps) are each easy to guarantee directly, and doing so keeps every
 * generated case useful instead of thrown away. Titles and descriptions are
 * left out — both are optional, and `renderDiagram`'s fallback for a missing
 * one is exercised by every case this way.
 *
 * Labels use `fc.string()` rather than a constrained alphabet on purpose:
 * `LabelSchema` only bounds length (1–80), so any character a model could put
 * in a label — including `<`, `&`, quotes — is a valid spec, and is exactly
 * the input `escapeXml` exists to make safe. Exercising it here, inside a
 * real render, is a stronger check than testing `escapeXml` in isolation
 * alone.
 */
const id = fc.stringMatching(/^[a-z][a-z0-9]{0,5}$/);
const text = fc.string({ minLength: 1, maxLength: 70 });

/** `n` distinct ids, generated directly (no post-hoc filtering). */
function ids(min: number, max: number) {
  return fc.uniqueArray(id, { minLength: min, maxLength: max });
}

/** `n` label strings, one per element. */
function texts(n: number) {
  return fc.array(text, { minLength: n, maxLength: n });
}

/** At most `DIAGRAM_HEADLINE_BUDGET` (2) `true`s among `n` flags, built directly. */
function headlineFlags(n: number): fc.Arbitrary<boolean[]> {
  return fc.integer({ min: 0, max: Math.min(2, n) }).map((count) => {
    const flags = new Array(n).fill(false);
    for (let i = 0; i < count; i++) flags[i] = true;
    return flags;
  });
}

const FLOWCHART_KINDS = ["start", "end", "step", "decision"] as const;

const flowchartSpec: fc.Arbitrary<FlowchartSpec> = ids(2, 9).chain((nodeIds) =>
  fc
    .tuple(
      fc.array(fc.constantFrom(...FLOWCHART_KINDS), { minLength: nodeIds.length, maxLength: nodeIds.length }),
      headlineFlags(nodeIds.length),
      texts(nodeIds.length),
      // At most 3 outgoing edges per node, satisfying the decision fan-out
      // cap for every node regardless of its kind.
      fc.array(fc.integer({ min: 0, max: Math.min(3, nodeIds.length) }), {
        minLength: nodeIds.length,
        maxLength: nodeIds.length,
      }),
    )
    .map(([kinds, headlines, labels, fanouts]) => {
      const nodes = nodeIds.map((nid, i) => ({
        id: nid,
        kind: kinds[i],
        label: labels[i],
        headline: headlines[i],
      }));
      const edges: FlowchartSpec["edges"] = [];
      nodeIds.forEach((from, i) => {
        for (let k = 0; k < fanouts[i]; k++) {
          const to = nodeIds[(i + k + 1) % nodeIds.length];
          if (to !== from) edges.push({ from, to });
        }
      });
      if (edges.length === 0) edges.push({ from: nodeIds[0], to: nodeIds[nodeIds.length - 1] });
      return { type: "flowchart", nodes, edges: edges.slice(0, 12) } as FlowchartSpec;
    }),
);

const stateSpec: fc.Arbitrary<StateSpec> = ids(2, 9).chain((stateIds) =>
  fc
    .tuple(
      headlineFlags(stateIds.length),
      fc.array(fc.boolean(), { minLength: stateIds.length, maxLength: stateIds.length }),
      texts(stateIds.length),
    )
    .map(([headlines, initials, labels]) => {
      const states = stateIds.map((sid, i) => ({
        id: sid,
        label: labels[i],
        initial: initials[i],
        final: !initials[i],
        headline: headlines[i],
      }));
      const transitions: StateSpec["transitions"] = [];
      for (let i = 0; i < stateIds.length - 1; i++) {
        transitions.push({ from: stateIds[i], to: stateIds[i + 1] });
      }
      if (transitions.length === 0) transitions.push({ from: stateIds[0], to: stateIds[0] });
      return { type: "state", states, transitions: transitions.slice(0, 12) } as StateSpec;
    }),
);

const erSpec: fc.Arbitrary<ErSpec> = ids(1, 8).chain((entityIds) =>
  fc.tuple(headlineFlags(entityIds.length), texts(entityIds.length)).map(([headlines, names]) => {
    const entities = entityIds.map((eid, i) => ({
      id: eid,
      name: names[i],
      headline: headlines[i],
      fields: [{ name: `field_${i}`, pk: i === 0, fk: false }],
    }));
    const relationships: ErSpec["relationships"] =
      entityIds.length > 1
        ? [{ from: entityIds[0], to: entityIds[1], cardinality: "one-to-many" as const }]
        : [];
    return { type: "er", entities, relationships } as ErSpec;
  }),
);

const diagramSpec: fc.Arbitrary<DiagramSpec> = fc.oneof(flowchartSpec, stateSpec, erSpec);

describe("diagram specs", () => {
  it("every generated spec is itself schema-valid (sanity check on the generator)", () => {
    fc.assert(
      fc.property(diagramSpec, (spec) => {
        expect(() => DiagramSpecSchema.parse(spec)).not.toThrow();
      }),
      RUNS,
    );
  });

  it("specToMermaid never throws on a schema-valid spec", () => {
    fc.assert(
      fc.property(diagramSpec, (spec) => {
        expect(() => specToMermaid(DiagramSpecSchema.parse(spec))).not.toThrow();
      }),
      RUNS,
    );
  });

  it("renderDiagram never throws on a schema-valid spec", () => {
    fc.assert(
      fc.property(diagramSpec, (spec) => {
        expect(() => renderDiagram(DiagramSpecSchema.parse(spec), "id")).not.toThrow();
      }),
      RUNS,
    );
  });
});

describe("escapeXml", () => {
  it("contains no raw < or >, and no & that doesn't start a known entity", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (s) => {
        const escaped = escapeXml(s);
        expect(escaped).not.toMatch(/<|>/);
        // Every "&" starts one of the five entities this function emits.
        // (The source emits `&apos;` for `'` — the XML-predefined form —
        // rather than HTML's `&#39;`; both are valid XML/SVG, and this spec
        // names the one the code actually produces.)
        const stray = escaped.replace(/&(amp|lt|gt|quot|apos);/g, "");
        expect(stray).not.toContain("&");
      }),
      RUNS,
    );
  });
});
