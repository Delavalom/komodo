import type { DiagramSpec } from "./spec.js";
import { layoutSequence } from "./layout/sequence.js";
import { layoutFlowchart } from "./layout/flowchart.js";
import { layoutState } from "./layout/state.js";
import { layoutEr } from "./layout/er.js";
import { renderSequenceDiagram } from "./render/sequence.js";
import { renderFlowchartDiagram } from "./render/flowchart.js";
import { renderStateDiagram } from "./render/state.js";
import { renderErDiagram } from "./render/er.js";
import { theme as defaultTheme, type Theme } from "./theme.js";
import type { RenderContext } from "./render/shared.js";

const DEFAULT_TITLE: Record<DiagramSpec["type"], string> = {
  sequence: "Sequence diagram",
  flowchart: "Flowchart",
  state: "State diagram",
  er: "Entity-relationship diagram",
};

function defaultDescription(spec: DiagramSpec): string {
  switch (spec.type) {
    case "sequence":
      return `Sequence diagram with ${spec.actors.length} actors.`;
    case "flowchart":
      return `Flowchart with ${spec.nodes.length} steps.`;
    case "state":
      return `State diagram with ${spec.states.length} states.`;
    case "er":
      return `Entity-relationship diagram with ${spec.entities.length} entities.`;
  }
}

/**
 * Renders a validated diagram spec to a self-contained SVG string.
 * `instanceId` must be unique per diagram on the page — it prefixes every
 * internal id (markers, title, desc) so more than one inline diagram never
 * collides on ids.
 */
export function renderDiagram(spec: DiagramSpec, instanceId: string, customTheme: Theme = defaultTheme): string {
  const ctx: RenderContext = { instanceId, theme: customTheme };
  const title = spec.title ?? DEFAULT_TITLE[spec.type];
  const description = spec.description ?? defaultDescription(spec);

  switch (spec.type) {
    case "sequence":
      return renderSequenceDiagram(ctx, layoutSequence(spec), title, description);
    case "flowchart":
      return renderFlowchartDiagram(ctx, layoutFlowchart(spec), title, description);
    case "state":
      return renderStateDiagram(ctx, layoutState(spec), title, description);
    case "er":
      return renderErDiagram(ctx, layoutEr(spec), title, description);
  }
}
