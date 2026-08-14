import { z } from "zod";

export const SEVERITIES = ["critical", "major", "minor", "trivial"] as const;

/**
 * What kind of thing the reader is being asked to judge. This replaces the old
 * `category` taxonomy: categories described the defect, kinds describe the
 * decision. "Unsure" is Komodo admitting it could not read enough to be sure.
 */
export const JUDGEMENT_KINDS = ["Choice", "Risk", "Behaviour", "Domain", "Unsure"] as const;

/** Where an answer lands in the posted review. */
export const BUCKETS = ["Blocks", "Agreed", "Asked", "Passed on"] as const;

export type Severity = (typeof SEVERITIES)[number];
export type JudgementKind = (typeof JUDGEMENT_KINDS)[number];
export type Bucket = (typeof BUCKETS)[number];

export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 3,
  major: 2,
  minor: 1,
  trivial: 0,
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "🔴 Critical",
  major: "🟠 Major",
  minor: "🟡 Minor",
  trivial: "🔵 Trivial",
};

export const KIND_LABEL: Record<JudgementKind, string> = {
  Choice: "A choice was made",
  Risk: "A risk was taken",
  Behaviour: "Behaviour changes",
  Domain: "Reaches outside this change",
  Unsure: "Komodo is unsure",
};

export const JudgementOptionSchema = z.object({
  label: z
    .string()
    .describe("The answer as the reader would say it out loud, e.g. \"Yes — fifteen minutes is fine\""),
  bucket: z.enum(BUCKETS).describe("Where this answer lands in the posted review"),
});

export const JudgementSchema = z.object({
  path: z.string().describe("Repo-relative file path the judgement is about"),
  line: z
    .number()
    .int()
    .describe("Line number in the NEW version of the file (must be a changed/added line shown in the diff)"),
  endLine: z
    .number()
    .int()
    .optional()
    .describe("For multi-line judgements: last line of the range (line is then the first)"),
  severity: z.enum(SEVERITIES),
  kind: z.enum(JUDGEMENT_KINDS),
  tag: z
    .string()
    .describe("Four to six words on what area this touches, e.g. \"changes how logging out works\""),
  title: z
    .string()
    .describe("One complete sentence stating what is true, ending in a period. No jargon, no severity words."),
  lede: z
    .string()
    .describe(
      "Two or three sentences of plain language: what this does and what it costs. Consequence first, mechanism second. Written for someone who has not read the diff.",
    ),
  detail: z
    .string()
    .describe("One or two more sentences: the alternative, or why it was probably done this way."),
  ask: z
    .string()
    .describe(
      "The single question the reader must answer, phrased as a real question a person can say yes or no to. Never 'is this ok?'",
    ),
  sources: z
    .array(z.string())
    .describe(
      "What was actually read to reach this, e.g. [\"the diff\", \"PR description\", \"ADR-0004 · stateless services\"]. Never claim a source you were not given.",
    ),
  sourceNote: z
    .string()
    .describe("One or two sentences on what those sources say and why they make this a blocker or a preference."),
  code: z
    .string()
    .describe(
      "A short plain-text excerpt for the collapsed 'Show me the code' block: file:line plus the relevant call or value, one per line. No fences.",
    ),
  options: z
    .array(JudgementOptionSchema)
    .length(4)
    .describe(
      "Exactly four answers. The first two are the real alternatives for THIS judgement. The third must be an 'I have a question first' (Asked). The fourth must hand it off (Passed on).",
    ),
  suggestion: z
    .string()
    .optional()
    .describe(
      "Replacement source code for the exact line range (line..endLine). Raw code only, no fences. Omit if no safe mechanical fix exists.",
    ),
  fixPrompt: z
    .string()
    .describe("A self-contained prompt a coding agent (Claude Code, Cursor, Codex) could run to fix this"),
});

export const WalkthroughEntrySchema = z.object({
  files: z.array(z.string()).describe("Related files grouped into one row"),
  summary: z.string().describe("Plain-language description of what changed in these files"),
});

export const ReviewResultSchema = z.object({
  summary: z
    .string()
    .describe(
      "High-level PR summary as GitHub markdown bullets grouped by change type (New Features / Bug Fixes / Refactors / Tests / Docs). No heading.",
    ),
  walkthrough: z.array(WalkthroughEntrySchema),
  confidence: z
    .number()
    .int()
    .min(0)
    .max(5)
    .describe("Merge-confidence 0 (do not merge) to 5 (ready to merge)"),
  verdict: z.string().describe("One short line justifying the confidence score"),
  effort: z.number().int().min(1).max(5).describe("Estimated human review effort 1-5"),
  diagram: z
    .string()
    .optional()
    .describe("Mermaid sequenceDiagram source (no fences) when the PR changes a flow/interaction; else omit"),
  judgements: z.array(JudgementSchema),
});

export type JudgementOption = z.infer<typeof JudgementOptionSchema>;
export type Judgement = z.infer<typeof JudgementSchema>;
export type WalkthroughEntry = z.infer<typeof WalkthroughEntrySchema>;
export type ReviewResult = z.infer<typeof ReviewResultSchema>;

/** A stored review run: result + the metadata the UI needs to render it. */
export interface ReviewRecord {
  version: 2;
  id: string;
  createdAt: string;
  provider: string;
  model?: string;
  pr: {
    owner: string;
    repo: string;
    number: number;
    title: string;
    author: string;
    url: string;
    baseRef: string;
    headRef: string;
    headSha: string;
  };
  files: { path: string; additions: number; deletions: number; status: string; patch?: string }[];
  result: ReviewResult;
  posted: boolean;
}

export function reviewResultJsonSchema(): Record<string, unknown> {
  // draft-07 + no $schema key: the Claude Code CLI's validator rejects the
  // draft/2020-12 meta-schema reference zod v4 emits by default.
  const schema = z.toJSONSchema(ReviewResultSchema, { target: "draft-7" }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}
