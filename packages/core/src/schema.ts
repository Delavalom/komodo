import { z } from "zod";

export const SEVERITIES = ["critical", "major", "minor", "trivial"] as const;

/**
 * What kind of thing the reader is being asked to judge. This replaces the old
 * `category` taxonomy: categories described the defect, kinds describe the
 * decision. "Unsure" is Komodo admitting it could not read enough to be sure.
 */
export const JUDGEMENT_KINDS = ["Choice", "Risk", "Behaviour", "Domain", "Unsure"] as const;

/**
 * The part of human review a judgement belongs to.
 *
 * `code` is kept for source-visible preflight findings. The other three are
 * the decisions a human is still needed for after an agent has read the diff.
 */
export const REVIEW_FOCI = ["code", "architecture", "scope", "tests"] as const;

/** What can substantiate an observation about the running change. */
export const EVIDENCE_KINDS = [
  "preview",
  "screenshot",
  "video",
  "test_run",
  "command_output",
  "manual_observation",
] as const;

/** Where an answer lands in the posted review. */
export const BUCKETS = ["Blocks", "Agreed", "Asked", "Passed on"] as const;

export type Severity = (typeof SEVERITIES)[number];
export type JudgementKind = (typeof JUDGEMENT_KINDS)[number];
export type ReviewFocus = (typeof REVIEW_FOCI)[number];
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];
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

export const FOCUS_LABEL: Record<ReviewFocus, string> = {
  code: "AI preflight",
  architecture: "Architecture",
  scope: "Change scope",
  tests: "Test adequacy",
};

export const JudgementOptionSchema = z.object({
  label: z
    .string()
    .describe("The answer as the reader would say it out loud, e.g. \"Yes — fifteen minutes is fine\""),
  bucket: z.enum(BUCKETS).describe("Where this answer lands in the posted review"),
});

export const JudgementSchema = z.object({
  path: z
    .string()
    .describe(
      "Repo-relative file path, or an empty string for a cross-cutting architecture, scope, or missing-test concern",
    ),
  line: z
    .number()
    .int()
    .nonnegative()
    .describe("Line number in the NEW file, or 0 when no single changed line owns the concern"),
  endLine: z
    .number()
    .int()
    .optional()
    .describe("For multi-line judgements: last line of the range (line is then the first)"),
  severity: z.enum(SEVERITIES),
  kind: z.enum(JUDGEMENT_KINDS),
  focus: z
    .enum(REVIEW_FOCI)
    .default("code")
    .describe("Whether this is AI preflight, architecture, scope discipline, or test adequacy"),
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

export const VerificationCheckSchema = z.object({
  title: z
    .string()
    .describe("The observable result a human needs to verify, stated without claiming it already works"),
  instruction: z
    .string()
    .describe("A concrete way to exercise the result in a local, staging, or preview environment"),
  expectedResult: z
    .string()
    .describe("What the reviewer should observe if the change works"),
  evidenceKinds: z
    .array(z.enum(EVIDENCE_KINDS))
    .min(1)
    .describe("The proof that can substantiate the observation"),
  required: z
    .boolean()
    .describe("True when the result must be observed before human review can be complete"),
});

export const WalkthroughEntrySchema = z.object({
  files: z.array(z.string()).describe("Related files grouped into one row"),
  summary: z.string().describe("Plain-language description of what changed in these files"),
});

export const ReviewResultSchema = z.object({
  // Non-empty, and this is the reason: a result that validates with an empty
  // summary and no verdict line is a review that says nothing, and storing one
  // marks a commit as reviewed. `verificationChecks` may legitimately be empty
  // — a documentation change has no runtime result to observe — but a review
  // with nothing written in it is not a review of anything.
  summary: z
    .string()
    .min(1)
    .describe(
      "High-level PR summary as GitHub markdown bullets grouped by change type (New Features / Bug Fixes / Refactors / Tests / Docs). No heading.",
    ),
  walkthrough: z.array(WalkthroughEntrySchema),
  confidence: z
    .number()
    .int()
    .min(0)
    .max(5)
    .describe("Review-coverage confidence from 0 (material context missing) to 5 (the review brief is well grounded)"),
  verdict: z
    .string()
    .min(1)
    .describe("One short line explaining what the review could and could not establish; never a merge recommendation"),
  effort: z.number().int().min(1).max(5).describe("Estimated human review effort 1-5"),
  verificationChecks: z
    .array(VerificationCheckSchema)
    .default([])
    .describe(
      "Checks a human must perform against the running result. Empty only when the change has no observable runtime, generated, or operational result.",
    ),
  diagram: z
    .string()
    .optional()
    .describe("Mermaid sequenceDiagram source (no fences) when the PR changes a flow/interaction; else omit"),
  judgements: z.array(JudgementSchema),
});

export type JudgementOption = z.infer<typeof JudgementOptionSchema>;
export type Judgement = z.infer<typeof JudgementSchema>;
export type VerificationCheck = z.infer<typeof VerificationCheckSchema>;
export type WalkthroughEntry = z.infer<typeof WalkthroughEntrySchema>;
export type ReviewResult = z.infer<typeof ReviewResultSchema>;

/**
 * A stored review run: result + the metadata the UI needs to render it.
 *
 * A schema rather than an interface because this shape now crosses a network.
 * An agent reviewing on a laptop builds the record there — it is the side with
 * the checkout — and posts it to a Komodo deployment that has no working tree
 * and no reason to trust the sender. Everything that arrives by that route is
 * parsed through here first.
 */
export const ReviewRecordSchema = z.object({
  version: z.literal(3),
  id: z.string().min(1),
  createdAt: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().optional(),
  pr: z.object({
    owner: z.string().min(1),
    repo: z.string().min(1),
    number: z.number().int(),
    title: z.string(),
    author: z.string(),
    url: z.string(),
    baseRef: z.string(),
    headRef: z.string(),
    headSha: z.string().min(1),
  }),
  files: z
    .array(
      z.object({
        path: z.string().min(1),
        additions: z.number().int(),
        deletions: z.number().int(),
        status: z.string(),
        patch: z.string().optional(),
      }),
    )
    // One row per path, because the store derives a review file's id from the
    // path and a duplicate raises a constraint violation halfway through
    // saving the run. Refused here, where the caller is told what is wrong,
    // rather than there, where it leaves a half-written review behind.
    .refine(
      (files) => new Set(files.map((file) => file.path)).size === files.length,
      { message: "Two files in this record have the same path." },
    ),
  result: ReviewResultSchema,
  posted: z.boolean(),
});

export type ReviewRecord = z.infer<typeof ReviewRecordSchema>;

export function reviewResultJsonSchema(): Record<string, unknown> {
  // draft-07 + no $schema key: the Claude Code CLI's validator rejects the
  // draft/2020-12 meta-schema reference zod v4 emits by default.
  const schema = z.toJSONSchema(ReviewResultSchema, { target: "draft-7" }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}
