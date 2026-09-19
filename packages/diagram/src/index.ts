export {
  DiagramSpecSchema,
  SequenceSpecSchema,
  FlowchartSpecSchema,
  StateSpecSchema,
  ErSpecSchema,
  type DiagramSpec,
  type DiagramType,
  type SequenceSpec,
  type SequenceActor,
  type SequenceMessage,
  type SequenceFragment,
  type SequenceItem,
  type FlowchartSpec,
  type StateSpec,
  type ErSpec,
} from "./spec.js";

export { renderDiagram } from "./render.js";
export { specToMermaid } from "./mermaid.js";
export { theme, type Theme } from "./theme.js";

export { layoutSequence, type SequenceLayout } from "./layout/sequence.js";
export { layoutFlowchart, type FlowchartLayout } from "./layout/flowchart.js";
export { layoutState, type StateLayout } from "./layout/state.js";
export { layoutEr, type ErLayout } from "./layout/er.js";

export { pathIsOrthogonal, escapeXml } from "./geometry.js";
