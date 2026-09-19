import { z } from "zod";

/**
 * Structured diagram spec emitted by the reviewer model in place of free-text
 * Mermaid. Budgets below mirror the complexity limits in the diagram-design
 * skill's SKILL.md §7 and the sequence-specific budget in type-sequence.md —
 * an over-budget model output fails validation here instead of reaching the
 * renderer, which has no way to lay out a diagram past its grammar's limits.
 */

const IdSchema = z.string().min(1).max(64);
const LabelSchema = z.string().min(1).max(80);

// ---------------------------------------------------------------------------
// Sequence
// ---------------------------------------------------------------------------

const SequenceActorSchema = z.object({
  id: IdSchema,
  name: LabelSchema,
});

const SequenceMessageSchema = z.object({
  from: IdSchema,
  to: IdSchema,
  kind: z.enum(["call", "return", "async"]),
  label: LabelSchema,
  /** Coral headline treatment. Budget: at most 2 across the whole diagram. */
  headline: z.boolean().default(false),
});

const SequenceRegionSchema = z.object({
  guard: LabelSchema.optional(),
  messages: z.array(SequenceMessageSchema).min(1).max(12),
});

const SequenceFragmentSchema = z.object({
  kind: z.enum(["alt", "opt", "loop"]),
  regions: z.array(SequenceRegionSchema).min(1).max(2),
});

const SequenceItemSchema = z.union([
  z.object({ kind: z.literal("message"), message: SequenceMessageSchema }),
  z.object({ kind: z.literal("fragment"), fragment: SequenceFragmentSchema }),
]);

export const SequenceSpecSchema = z
  .object({
    type: z.literal("sequence"),
    title: LabelSchema.optional(),
    description: z.string().max(240).optional(),
    actors: z.array(SequenceActorSchema).min(2).max(5),
    items: z.array(SequenceItemSchema).min(1).max(13),
  })
  .superRefine((spec, ctx) => {
    const actorIds = new Set(spec.actors.map((a) => a.id));
    const messages: z.infer<typeof SequenceMessageSchema>[] = [];
    let fragments = 0;
    let altCount = 0;
    let optLoopCount = 0;
    let headlineCount = 0;

    for (const item of spec.items) {
      if (item.kind === "message") {
        messages.push(item.message);
      } else {
        fragments++;
        if (item.fragment.kind === "alt") altCount++;
        else optLoopCount++;
        if (item.fragment.kind === "alt" && item.fragment.regions.length !== 2 && item.fragment.regions.length !== 1) {
          ctx.addIssue({ code: "custom", message: "alt fragments take 1 or 2 regions" });
        }
        for (const region of item.fragment.regions) messages.push(...region.messages);
      }
    }

    if (messages.length > 12) {
      ctx.addIssue({ code: "custom", message: "sequence: at most 12 messages total" });
    }
    // Max combined fragments: 1 by default; 2 only if each is a single-region opt/loop.
    if (fragments > 2 || (fragments === 2 && (altCount > 0 || optLoopCount !== 2))) {
      ctx.addIssue({
        code: "custom",
        message: "sequence: at most 1 combined fragment, or 2 only if both are single-region opt/loop",
      });
    }
    headlineCount = messages.filter((m) => m.headline).length;
    if (headlineCount > 2) {
      ctx.addIssue({ code: "custom", message: "sequence: at most 2 headline (coral) messages" });
    }
    for (const message of messages) {
      if (!actorIds.has(message.from) || !actorIds.has(message.to)) {
        ctx.addIssue({ code: "custom", message: `sequence: message references an unknown actor id` });
      }
    }
  });

// ---------------------------------------------------------------------------
// Flowchart
// ---------------------------------------------------------------------------

const FlowchartNodeSchema = z.object({
  id: IdSchema,
  kind: z.enum(["start", "end", "step", "decision"]),
  label: LabelSchema,
  headline: z.boolean().default(false),
});

const FlowchartEdgeSchema = z.object({
  from: IdSchema,
  to: IdSchema,
  label: LabelSchema.optional(),
});

export const FlowchartSpecSchema = z
  .object({
    type: z.literal("flowchart"),
    title: LabelSchema.optional(),
    description: z.string().max(240).optional(),
    nodes: z.array(FlowchartNodeSchema).min(2).max(9),
    edges: z.array(FlowchartEdgeSchema).min(1).max(12),
  })
  .superRefine((spec, ctx) => {
    const ids = new Set(spec.nodes.map((n) => n.id));
    const exitsByNode = new Map<string, number>();
    for (const edge of spec.edges) {
      if (!ids.has(edge.from) || !ids.has(edge.to)) {
        ctx.addIssue({ code: "custom", message: "flowchart: edge references an unknown node id" });
      }
      exitsByNode.set(edge.from, (exitsByNode.get(edge.from) ?? 0) + 1);
    }
    for (const node of spec.nodes) {
      if (node.kind === "decision" && (exitsByNode.get(node.id) ?? 0) > 3) {
        ctx.addIssue({ code: "custom", message: `flowchart: decision "${node.id}" has more than 3 exits` });
      }
    }
    const headlineCount = spec.nodes.filter((n) => n.headline).length;
    if (headlineCount > 2) {
      ctx.addIssue({ code: "custom", message: "flowchart: at most 2 headline (coral) elements" });
    }
  });

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

const StateNodeSchema = z.object({
  id: IdSchema,
  label: LabelSchema,
  initial: z.boolean().default(false),
  final: z.boolean().default(false),
  headline: z.boolean().default(false),
});

const StateTransitionSchema = z.object({
  from: IdSchema,
  to: IdSchema,
  label: LabelSchema.optional(),
  guard: z.string().max(60).optional(),
});

export const StateSpecSchema = z
  .object({
    type: z.literal("state"),
    title: LabelSchema.optional(),
    description: z.string().max(240).optional(),
    states: z.array(StateNodeSchema).min(2).max(9),
    transitions: z.array(StateTransitionSchema).min(1).max(12),
  })
  .superRefine((spec, ctx) => {
    const ids = new Set(spec.states.map((s) => s.id));
    for (const transition of spec.transitions) {
      if (!ids.has(transition.from) || !ids.has(transition.to)) {
        ctx.addIssue({ code: "custom", message: "state: transition references an unknown state id" });
      }
    }
    const headlineCount = spec.states.filter((s) => s.headline).length;
    if (headlineCount > 2) {
      ctx.addIssue({ code: "custom", message: "state: at most 2 headline (coral) elements" });
    }
  });

// ---------------------------------------------------------------------------
// ER / logical data model
// ---------------------------------------------------------------------------

const ErFieldSchema = z.object({
  name: LabelSchema,
  type: z.string().max(40).optional(),
  pk: z.boolean().default(false),
  fk: z.boolean().default(false),
});

const ErEntitySchema = z.object({
  id: IdSchema,
  name: LabelSchema,
  fields: z.array(ErFieldSchema).min(1).max(10),
  headline: z.boolean().default(false),
});

const ErRelationshipSchema = z.object({
  from: IdSchema,
  to: IdSchema,
  label: LabelSchema.optional(),
  cardinality: z.enum(["one-to-one", "one-to-many", "many-to-many"]).default("one-to-many"),
});

export const ErSpecSchema = z
  .object({
    type: z.literal("er"),
    title: LabelSchema.optional(),
    description: z.string().max(240).optional(),
    entities: z.array(ErEntitySchema).min(1).max(8),
    relationships: z.array(ErRelationshipSchema).max(12).default([]),
  })
  .superRefine((spec, ctx) => {
    const ids = new Set(spec.entities.map((e) => e.id));
    for (const rel of spec.relationships) {
      if (!ids.has(rel.from) || !ids.has(rel.to)) {
        ctx.addIssue({ code: "custom", message: "er: relationship references an unknown entity id" });
      }
    }
    const headlineCount = spec.entities.filter((e) => e.headline).length;
    if (headlineCount > 2) {
      ctx.addIssue({ code: "custom", message: "er: at most 2 headline (coral) elements" });
    }
  });

// ---------------------------------------------------------------------------

export const DiagramSpecSchema = z.discriminatedUnion("type", [
  SequenceSpecSchema,
  FlowchartSpecSchema,
  StateSpecSchema,
  ErSpecSchema,
]);

export type SequenceActor = z.infer<typeof SequenceActorSchema>;
export type SequenceMessage = z.infer<typeof SequenceMessageSchema>;
export type SequenceFragment = z.infer<typeof SequenceFragmentSchema>;
export type SequenceItem = z.infer<typeof SequenceItemSchema>;
export type SequenceSpec = z.infer<typeof SequenceSpecSchema>;
export type FlowchartSpec = z.infer<typeof FlowchartSpecSchema>;
export type StateSpec = z.infer<typeof StateSpecSchema>;
export type ErSpec = z.infer<typeof ErSpecSchema>;
export type DiagramSpec = z.infer<typeof DiagramSpecSchema>;
export type DiagramType = DiagramSpec["type"];
