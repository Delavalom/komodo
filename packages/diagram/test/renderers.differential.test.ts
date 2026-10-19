/**
 * `specToMermaid` and `renderDiagram`, side by side on the same spec.
 *
 * Both read the same `DiagramSpec` and must agree on its graph structure —
 * one node per id, one edge per (from, to) pair — even though they serve
 * different purposes (`specToMermaid` for GitHub's native renderer,
 * `renderDiagram` for this package's own SVG). `render.property.test.ts`
 * (K2) proves each one never throws; this proves they never silently
 * disagree about *what* they drew.
 *
 * ## The plan-vs-code discrepancy this test works around
 *
 * The plan for this PR says to extract "node ids and edge pairs" from both
 * outputs with small regexes. That is straightforward for `specToMermaid` —
 * flowchart Mermaid writes `id[Label]` / `id{Label}` and `from --> to`
 * verbatim. But `renderDiagram`'s SVG (see `src/render/flowchart.ts`,
 * `src/render/shared.ts`) carries *no* spec-level ids anywhere: markers,
 * `<title>`/`<desc>` get `instanceId`-prefixed ids of their own, and nodes
 * are plain `<rect>`/`<polygon>` shapes positioned by layout, identified
 * only by their (escaped) label text. Edges are `<path>` connectors between
 * coordinates, with no id or label at all unless the edge itself carries
 * one.
 *
 * So the node ids and edges aren't *read back out of* the SVG the same way
 * they're read out of the Mermaid — there's no id to read. Instead, this
 * test builds specs whose labels encode that structure (`"n_<id>"` for a
 * node, `"e_<from>_<to>"` for an edge, with every edge forced to carry a
 * label so it is always drawn). Node ids are compared the direct way on both
 * sides (the Mermaid node declaration's own id; the SVG's decoded node-label
 * text). Edges are compared asymmetrically on purpose: the Mermaid side's
 * (from, to) is read off the arrow syntax itself (`from -->|label| to`), not
 * off the label, specifically so a renderer that drew the right label on
 * the wrong arrow would be caught rather than hidden — the mutation-testing
 * step recorded in this PR's description confirmed that distinction matters
 * by swapping `specToMermaid`'s arrow direction and watching this test catch
 * it. The SVG side has no arrow ids to read, so its (from, to) comes from
 * the edge label, the one channel connectivity survives rendering on. That
 * is the strongest check the real code supports: it fails exactly when the
 * two renderers would draw a graph with a different node set or different
 * connectivity than the spec says, which is the divergence this test exists
 * to catch.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { flowchartFixture } from "./fixtures.js";
import { specToMermaid } from "../src/mermaid.js";
import { renderDiagram } from "../src/render.js";
import type { FlowchartSpec } from "../src/spec.js";
import { DiagramSpecSchema } from "../src/spec.js";

const RUNS = { seed: 20261017, numRuns: 300 };

const id = fc.stringMatching(/^[a-z][a-z0-9]{0,5}$/);

function ids(min: number, max: number) {
  return fc.uniqueArray(id, { minLength: min, maxLength: max });
}

/**
 * A flowchart whose node labels are `n_<id>` and whose edge labels are
 * `e_<from>_<to>` — see the file doc above for why. Node kinds and headline
 * flags are varied for the same reason `render.property.test.ts` varies
 * them: every shape `renderFlowchart` draws differently should appear.
 */
const FLOWCHART_KINDS = ["start", "end", "step", "decision"] as const;

const encodedFlowchartSpec: fc.Arbitrary<FlowchartSpec> = ids(2, 9).chain((nodeIds) =>
  fc
    .tuple(
      fc.array(fc.constantFrom(...FLOWCHART_KINDS), { minLength: nodeIds.length, maxLength: nodeIds.length }),
      fc.array(fc.boolean(), { minLength: nodeIds.length, maxLength: nodeIds.length }),
      // At most 3 outgoing edges per node, matching render.property.test.ts's
      // own fan-out cap so every generated spec is schema-valid by
      // construction (decision nodes cap out at 3 outgoing edges).
      fc.array(fc.integer({ min: 0, max: Math.min(3, nodeIds.length) }), {
        minLength: nodeIds.length,
        maxLength: nodeIds.length,
      }),
    )
    .map(([kinds, headlines, fanouts]) => {
      const nodes = nodeIds.map((nid, i) => ({
        id: nid,
        kind: kinds[i],
        label: `n_${nid}`,
        headline: headlines[i] && i < 2, // DIAGRAM_HEADLINE_BUDGET is 2
      }));
      const edges: FlowchartSpec["edges"] = [];
      nodeIds.forEach((from, i) => {
        for (let k = 0; k < fanouts[i]; k++) {
          const to = nodeIds[(i + k + 1) % nodeIds.length];
          if (to !== from) edges.push({ from, to, label: `e_${from}_${to}` });
        }
      });
      if (edges.length === 0) {
        const to = nodeIds[nodeIds.length - 1];
        edges.push({ from: nodeIds[0], to, label: `e_${nodeIds[0]}_${to}` });
      }
      return { type: "flowchart", nodes, edges: edges.slice(0, 12) } as FlowchartSpec;
    }),
);

/** Node ids `specToMermaid` wrote, read back out of its own syntax:
 * `  id([...])`, `id{...}` or `id[...]`, each wrapping a quoted `"n_<id>"`. */
function nodeIdsFromMermaid(mermaid: string): string[] {
  const found: string[] = [];
  for (const line of mermaid.split("\n")) {
    const m = /^ {2}(\w+)[^"]*"n_([a-z][a-z0-9]{0,5})"[^"]*$/.exec(line);
    if (m) found.push(m[2]);
  }
  return found.sort();
}

/**
 * (from, to) pairs `specToMermaid` wrote, read from the arrow syntax itself
 * (`  from -->|label| to`) — the ids either side of `-->`, not the label.
 * Reading the label instead would make this blind to a renderer that drew
 * the right label on the wrong arrow; the mutation-testing step below
 * confirms that distinction matters.
 */
function edgesFromMermaid(mermaid: string): string[] {
  const found: string[] = [];
  for (const line of mermaid.split("\n")) {
    const m = /^ {2}(\w+) -->(?:\|[^|]*\|)? (\w+)$/.exec(line);
    if (m) found.push(`${m[1]}->${m[2]}`);
  }
  return found.sort();
}

/** Node ids the SVG carries, decoded from the one place they survive:
 * node-label `<text>` content, `n_<id>`. */
function nodeIdsFromSvg(svg: string): string[] {
  return [...svg.matchAll(/>n_([a-z][a-z0-9]{0,5})</g)].map((m) => m[1]).sort();
}

/** (from, to) pairs the SVG carries, decoded from an edge's own label text,
 * `e_<from>_<to>` — the only channel connectivity survives rendering on,
 * since connectors are drawn as bare coordinate paths with no id. */
function edgesFromSvg(svg: string): string[] {
  return [...svg.matchAll(/>e_([a-z][a-z0-9]{0,5})_([a-z][a-z0-9]{0,5})</g)]
    .map((m) => `${m[1]}->${m[2]}`)
    .sort();
}

describe("specToMermaid and renderDiagram agree on node ids and edge pairs", () => {
  it("every generated spec is schema-valid (sanity check on the generator)", () => {
    fc.assert(
      fc.property(encodedFlowchartSpec, (spec) => {
        expect(() => DiagramSpecSchema.parse(spec)).not.toThrow();
      }),
      RUNS,
    );
  });

  it("the node id set matches between the two outputs", () => {
    fc.assert(
      fc.property(encodedFlowchartSpec, (spec) => {
        const parsed = DiagramSpecSchema.parse(spec) as FlowchartSpec;
        const mermaidIds = nodeIdsFromMermaid(specToMermaid(parsed));
        const svgIds = nodeIdsFromSvg(renderDiagram(parsed, "id"));
        expect(svgIds).toEqual(mermaidIds);
        expect(mermaidIds).toEqual(parsed.nodes.map((n) => n.id).sort());
      }),
      RUNS,
    );
  });

  it("the edge pair set matches between the two outputs", () => {
    fc.assert(
      fc.property(encodedFlowchartSpec, (spec) => {
        const parsed = DiagramSpecSchema.parse(spec) as FlowchartSpec;
        const mermaidEdges = edgesFromMermaid(specToMermaid(parsed));
        const svgEdges = edgesFromSvg(renderDiagram(parsed, "id"));
        expect(svgEdges).toEqual(mermaidEdges);
        expect(mermaidEdges).toEqual(parsed.edges.map((e) => `${e.from}->${e.to}`).sort());
      }),
      RUNS,
    );
  });

  it("a recorded real spec (fixtures.ts's checkout-validation flowchart) agrees too", () => {
    // fixtures.ts's own labels don't follow the n_/e_ convention, so this
    // case checks counts (the one signal available for an arbitrary label),
    // not decoded ids — the recorded-input half of S3's input mix, the
    // generator above being the property half.
    const mermaid = specToMermaid(flowchartFixture);
    const svg = renderDiagram(flowchartFixture, "id");
    const mermaidNodeLines = mermaid.split("\n").filter((l) => /^ {2}\w+[([{]/.test(l) && !l.includes("-->"));
    expect(mermaidNodeLines).toHaveLength(flowchartFixture.nodes.length);
    const mermaidEdgeLines = mermaid.split("\n").filter((l) => l.includes("-->"));
    expect(mermaidEdgeLines).toHaveLength(flowchartFixture.edges.length);
    // Every node label appears, escaped the same way, in the SVG.
    for (const node of flowchartFixture.nodes) expect(svg).toContain(`>${node.label}<`);
  });
});
