import type { DiagramSpec, ErSpec, FlowchartSpec, SequenceSpec, StateSpec } from "./spec.js";

/** Mermaid identifiers can't contain most punctuation; spec ids are
 * free-form, so re-key them to safe, stable identifiers for Mermaid output. */
function mermaidId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, "_");
}

function quote(label: string): string {
  return `"${label.replace(/"/g, "'")}"`;
}

function sequenceToMermaid(spec: SequenceSpec): string {
  const lines = ["sequenceDiagram"];
  for (const actor of spec.actors) {
    lines.push(`  participant ${mermaidId(actor.id)} as ${actor.name}`);
  }

  const arrow: Record<"call" | "return" | "async", string> = {
    call: "->>",
    return: "-->>",
    async: "-)",
  };

  const writeMessage = (
    message: { from: string; to: string; kind: "call" | "return" | "async"; label: string },
    indent: string,
  ) => {
    const op = arrow[message.kind];
    lines.push(`${indent}${mermaidId(message.from)}${op}${mermaidId(message.to)}: ${message.label}`);
  };

  for (const item of spec.items) {
    if (item.kind === "message") {
      writeMessage(item.message, "  ");
      continue;
    }
    const keyword = item.fragment.kind;
    item.fragment.regions.forEach((region, i) => {
      if (i === 0) {
        lines.push(`  ${keyword}${region.guard ? ` ${region.guard}` : ""}`);
      } else {
        lines.push(`  else${region.guard ? ` ${region.guard}` : ""}`);
      }
      for (const message of region.messages) writeMessage(message, "    ");
    });
    lines.push("  end");
  }
  return lines.join("\n");
}

function flowchartToMermaid(spec: FlowchartSpec): string {
  const lines = ["flowchart TD"];
  for (const node of spec.nodes) {
    const id = mermaidId(node.id);
    const label = quote(node.label);
    if (node.kind === "start" || node.kind === "end") lines.push(`  ${id}([${label}])`);
    else if (node.kind === "decision") lines.push(`  ${id}{${label}}`);
    else lines.push(`  ${id}[${label}]`);
  }
  for (const edge of spec.edges) {
    const suffix = edge.label ? `|${edge.label}|` : "";
    lines.push(`  ${mermaidId(edge.from)} -->${suffix} ${mermaidId(edge.to)}`);
  }
  return lines.join("\n");
}

function stateToMermaid(spec: StateSpec): string {
  const lines = ["stateDiagram-v2"];
  for (const state of spec.states) {
    lines.push(`  ${mermaidId(state.id)}: ${state.label}`);
  }
  for (const state of spec.states) {
    if (state.initial) lines.push(`  [*] --> ${mermaidId(state.id)}`);
    if (state.final) lines.push(`  ${mermaidId(state.id)} --> [*]`);
  }
  for (const t of spec.transitions) {
    const label = [t.label, t.guard ? `[${t.guard}]` : null].filter(Boolean).join(" ");
    lines.push(`  ${mermaidId(t.from)} --> ${mermaidId(t.to)}${label ? `: ${label}` : ""}`);
  }
  return lines.join("\n");
}

const CARDINALITY_MERMAID: Record<ErSpec["relationships"][number]["cardinality"], string> = {
  "one-to-one": "||--||",
  "one-to-many": "||--o{",
  "many-to-many": "}o--o{",
};

function erToMermaid(spec: ErSpec): string {
  const lines = ["erDiagram"];
  for (const entity of spec.entities) {
    const id = mermaidId(entity.id);
    lines.push(`  ${id} {`);
    for (const field of entity.fields) {
      const tag = field.pk ? "PK" : field.fk ? "FK" : "";
      lines.push(`    ${field.type ?? "string"} ${field.name.replace(/\s+/g, "_")}${tag ? ` ${tag}` : ""}`);
    }
    lines.push("  }");
  }
  for (const rel of spec.relationships) {
    const op = CARDINALITY_MERMAID[rel.cardinality];
    lines.push(`  ${mermaidId(rel.from)} ${op} ${mermaidId(rel.to)} : ${quote(rel.label ?? "relates to")}`);
  }
  return lines.join("\n");
}

/** Structural serializer to native Mermaid syntax, used only for the GitHub
 * markdown comment path — GitHub renders Mermaid natively but can't run this
 * package's SVG renderer. */
export function specToMermaid(spec: DiagramSpec): string {
  switch (spec.type) {
    case "sequence":
      return sequenceToMermaid(spec);
    case "flowchart":
      return flowchartToMermaid(spec);
    case "state":
      return stateToMermaid(spec);
    case "er":
      return erToMermaid(spec);
  }
}
