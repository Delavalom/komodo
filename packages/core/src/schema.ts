import { z } from "zod";

export const SEVERITIES = ["critical", "major", "minor", "trivial"] as const;
export const CATEGORIES = [
  "security",
  "correctness",
  "performance",
  "maintainability",
  "data-integrity",
  "stability",
] as const;

export type Severity = (typeof SEVERITIES)[number];
export type Category = (typeof CATEGORIES)[number];

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

export const CATEGORY_LABEL: Record<Category, string> = {
  security: "🔒 Security",
  correctness: "🎯 Correctness",
  performance: "🚀 Performance",
  maintainability: "📐 Maintainability",
  "data-integrity": "🗄️ Data integrity",
  stability: "🩺 Stability",
};

export const FindingSchema = z.object({
  path: z.string().describe("Repo-relative file path the finding is in"),
  line: z
    .number()
    .int()
    .describe("Line number in the NEW version of the file (must be a changed/added line shown in the diff)"),
  endLine: z
    .number()
    .int()
    .optional()
    .describe("For multi-line findings: last line of the range (line is then the first)"),
  severity: z.enum(SEVERITIES),
  category: z.enum(CATEGORIES),
  title: z.string().describe("One-sentence statement of the defect"),
  body: z
    .string()
    .describe("Explanation: why it's a problem and the concrete failure scenario. GitHub markdown."),
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
  findings: z.array(FindingSchema),
});

export type Finding = z.infer<typeof FindingSchema>;
export type WalkthroughEntry = z.infer<typeof WalkthroughEntrySchema>;
export type ReviewResult = z.infer<typeof ReviewResultSchema>;

/** A stored review run: result + the metadata the UI needs to render it. */
export interface ReviewRecord {
  version: 1;
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
  return z.toJSONSchema(ReviewResultSchema) as Record<string, unknown>;
}
