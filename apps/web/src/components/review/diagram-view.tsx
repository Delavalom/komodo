import { renderDiagram } from "@komodo/diagram";
import type { DiagramSpec } from "@/lib/types";

/**
 * Renders a structured diagram spec to inline SVG using Komodo's own
 * rendering engine (packages/diagram) — not raw model-authored markup. The
 * SVG string below is built entirely by that deterministic renderer, which
 * XML-escapes every piece of spec text (node names, labels) before it
 * reaches markup, so `dangerouslySetInnerHTML` here never carries anything
 * the model wrote directly into the DOM.
 */
export function DiagramView({ spec, instanceId }: { spec: DiagramSpec; instanceId: string }) {
  const svg = renderDiagram(spec, instanceId);
  return (
    <div
      className="overflow-x-auto border border-border p-3"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
