/**
 * The `reflect` experiment: a second reader that checks each drafted
 * judgement against the code before a person sees it.
 *
 * Ported from OpenCodeReview (https://github.com/alibaba/open-code-review,
 * Apache-2.0) — see THIRD_PARTY_NOTICES.md. The source files are
 *   internal/agent/agent.go                                   (executeGroupReviewFilter,
 *                                                              buildGroupFilterCommentsJSON,
 *                                                              parseFilterToolCalls, filterTools)
 *   internal/config/template/prompts/review_filter_task_system.md
 *   internal/config/template/prompts/review_filter_task_user.md
 * OCR calls this its review filter. What carries over:
 *   - a separate call that sees the finished comments and the diff, never the
 *     drafting conversation;
 *   - a deliberately lopsided bar. Keeping a wrong comment costs a reader a
 *     few seconds, dropping a right one loses a finding nobody learns about,
 *     so a comment goes only when a named line proves it wrong (OCR's
 *     "Ground A" and "Ground B"), and never when its subject is a protected
 *     one (memory safety, concurrency, linkage, behaviour change, an unused
 *     parameter) or when it is merely style;
 *   - reasoning written before the verdict in the structured output. OCR's
 *     tool schema relies on field order for this ("the model reasons before
 *     it commits"), and so does `ReflectionVerdictSchema` below.
 * What is Komodo's own: `revise` (OCR can only remove), a checkout the second
 * reader may read (OCR's filter sees diffs only), and the house voice for any
 * text it rewrites.
 *
 * Nothing here is reachable without `experiments: ["reflect"]` on
 * `runReview`. There is deliberately no setting for it (AGENTS.md rule 3).
 */
import { z } from "zod";
import type { KomodoConfig } from "./config.js";
import { annotatePatch } from "./diff.js";
import type { PRFile, PRMeta } from "./github.js";
import type { PassUsage, ReviewProvider } from "./providers/types.js";
import type { Judgement } from "./schema.js";
import { voiceSection } from "./voice.js";

/** The name `RunReviewOptions.experiments` uses to switch this on. */
export const REFLECT_EXPERIMENT = "reflect";

/** Agent turns the reflection call may take when the caller gives none. */
export const REFLECT_DEFAULT_TURNS = 30;

export const REFLECT_VERDICTS = ["keep", "drop", "revise"] as const;
export type ReflectVerdict = (typeof REFLECT_VERDICTS)[number];

/**
 * What a `revise` may change. Text can only get shorter; the range can only
 * get narrower. Everything else on a judgement is out of reach, and
 * `applyReflection` enforces that rather than trusting this description.
 */
export const ReflectionRevisionSchema = z.object({
  title: z.string().nullable().describe("A shorter title, or null to leave it"),
  lede: z.string().nullable().describe("A shorter lede, or null to leave it"),
  detail: z.string().nullable().describe("A shorter detail, or null to leave it"),
  ask: z.string().nullable().describe("A shorter question, or null to leave it"),
  line: z
    .number()
    .int()
    .nullable()
    .describe("A first line inside the current range, or null to leave it"),
  endLine: z
    .number()
    .int()
    .nullable()
    .describe("A last line inside the current range, or null to leave it"),
});

export const ReflectionVerdictSchema = z.object({
  // Field order is load-bearing. The analysis is emitted before the verdict
  // so the model reasons first and cannot pick a verdict it then has to
  // contradict — the same reason OCR puts `analysis` ahead of `comment_ids`.
  id: z.string().describe("The judgement's id exactly as given, e.g. \"j-0\""),
  analysis: z
    .string()
    .describe(
      "Work through the judgement before deciding: does its subject hit a veto, which Ground applies if any, and the exact path:line that proves it.",
    ),
  verdict: z.enum(REFLECT_VERDICTS),
  reason: z
    .string()
    .describe("One sentence for a person reading the eval: why this verdict. For keep, say so in a few words."),
  revision: ReflectionRevisionSchema.nullable().describe("Only for revise; null otherwise"),
});

export const ReflectionResultSchema = z.object({
  verdicts: z.array(ReflectionVerdictSchema).describe("One entry per judgement, in the order given"),
});

export type ReflectionRevision = z.infer<typeof ReflectionRevisionSchema>;
export type ReflectionVerdict = z.infer<typeof ReflectionVerdictSchema>;
export type ReflectionResult = z.infer<typeof ReflectionResultSchema>;

export function reflectionJsonSchema(): Record<string, unknown> {
  // Same draft-07 treatment as reviewResultJsonSchema.
  const schema = z.toJSONSchema(ReflectionResultSchema, { target: "draft-7" }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

/** What a provider is handed to reflect on a finished set of judgements. */
export interface ReflectInput {
  pr: PRMeta;
  /** Files after path filtering, with patches. */
  files: PRFile[];
  /** The judgements to check, in the order their ids (`j-0`, `j-1`, …) refer to. */
  judgements: Judgement[];
  config: KomodoConfig;
  /** Local checkout of the PR head. Providers with tools may read it. */
  repoDir?: string;
  turnBudget?: number;
  /** Same contract as `ReviewInput.onUsage`: once per call, even if it then fails. */
  onUsage?: (usage: PassUsage) => void;
}

/** A judgement reflection removed, and why. */
export interface ReflectionDrop {
  judgement: Judgement;
  reason: string;
}

/** What a reflection call did to a set of judgements. */
export interface ReflectionApplied {
  kept: Judgement[];
  dropped: ReflectionDrop[];
  /** How many of `kept` were rewritten. */
  revised: number;
  /** Verdicts that were ignored, and why — an unknown id, a repeat, a revision that changed nothing legal. */
  ignored: string[];
}

export const judgementId = (index: number): string => `j-${index}`;

function whereLabel(j: Pick<Judgement, "path" | "line" | "endLine">): string {
  if (!j.path) return "(cross-cutting, no file)";
  if (j.line <= 0) return j.path;
  return j.endLine !== undefined && j.endLine !== j.line
    ? `${j.path}:${j.line}-${j.endLine}`
    : `${j.path}:${j.line}`;
}

/** The judgements as the second reader sees them: what was claimed and where, nothing about how to answer. */
export function renderJudgementsForReflection(judgements: Judgement[]): string {
  return judgements
    .map((j, i) =>
      [
        `### ${judgementId(i)}`,
        `- Where: ${whereLabel(j)}`,
        `- Focus: ${j.focus} · Kind: ${j.kind} · Severity: ${j.severity}`,
        `- Title: ${j.title}`,
        `- Lede: ${j.lede}`,
        `- Detail: ${j.detail}`,
        `- Ask: ${j.ask}`,
        `- Cited code:\n${j.code
          .split("\n")
          .map((l) => `    ${l}`)
          .join("\n")}`,
      ].join("\n"),
    )
    .join("\n\n");
}

export function buildReflectionPrompt(input: ReflectInput): string {
  const { pr, files, judgements, config, repoDir } = input;

  const diffs = files
    .map((f) => {
      const header = `### ${f.path} (${f.status}, +${f.additions}/-${f.deletions})`;
      if (!f.patch) return `${header}\n(no textual diff — binary or too large)`;
      return `${header}\n\`\`\`diff\n${annotatePatch(f.patch)}\n\`\`\``;
    })
    .join("\n\n");

  const checkout = repoDir
    ? `You can also read the checkout of the pull request head with Read, Glob and Grep. Use it to check a claim, never to look for new problems. A line you read there can establish Ground B, and you must cite it as \`path:line\`.`
    : `You cannot read the repository, only the diffs below. Anything you cannot see, the first reader may well have seen.`;

  return `You are a fact-checker for code review judgements.

These judgements were drafted by an agent that read this pull request and, where it had a checkout, the code around it. A second reader — you — checks them before a person does. Your task is narrow: remove only the judgements that the code **proves** to be factually wrong, and tighten the ones that say more than they can back.

You are not judging whether a judgement is useful, well-prioritised, or worth a reviewer's time. The two mistakes available to you are not equally bad:

- Keeping an incorrect judgement costs a reviewer a few seconds of attention.
- Dropping a correct one silently destroys a real finding. It never reaches anyone, and nobody learns it was dropped.

So when your evidence falls short of proof, keep. "Suspicious", "I cannot verify this", "low value", "the flagged code looks fine to me" and "I would not have raised this" all mean keep.

${checkout}

## Pull request
- Repo: ${pr.owner}/${pr.repo}
- #${pr.number}: ${pr.title}

### Description
${pr.body || "(empty)"}

## Diff
Each diff line is prefixed with its line number in the NEW version of the file.

${diffs}

## Judgements
Every judgement has a \`path\` and an id. The diff of that same path is its subject; the other files are context. They can supply the evidence a cross-file judgement rests on, but they never stand in for the subject file.

${renderJudgementsForReflection(judgements)}

## The only grounds for \`drop\`

**Ground A — the judgement targets code that is not in its subject file.** The symbol, statement or construct it describes appears nowhere in the file its \`path\` names. It discusses the body of a function in a file that only references it, it discusses host-language logic in a file that holds none, or it says code was removed or an error is handled and the file's diff shows no such change. Judged against that file alone: the same construct in a sibling file does not rescue it. A judgement with no path is not subject to Ground A.

**Ground B — a specific line literally contradicts its central claim.** It asserts a concrete fact and the code shows the opposite in plain text: it says an identifier is unused and a line uses it, a check is missing and a line contains it, a value is hardcoded and a line reads it from a variable. The line may be in any file, in the diff or in the checkout. The contradiction must be readable straight off that line, not derived through a chain of reasoning.

If you cannot name the \`path:line\` that establishes Ground A or Ground B, do not drop.

## Protected subjects — never drop
Applied before you judge correctness at all. Whatever you conclude, keep a judgement whose subject is:

- **Memory safety** — allocation size, buffer length, index bounds, off-by-one, use-after-free, null dereference
- **Concurrency** — locks, atomics, data races, ordering that is not honoured
- **Linkage and declaration consistency** — a declaration that disagrees with its definition, a missing export
- **Behavioural or compatibility change** — a message, field, status or default the old code produced and the new code no longer does; an altered error path
- **A parameter the function accepts and never uses**
- **A decision for a person** — focus \`architecture\`, \`scope\` or \`tests\`, or kind \`Unsure\`, unless Ground B applies. These ask a human to weigh something, and there is nothing in them for a diff to prove false.

These are where a wrongly dropped finding is most expensive and where your confidence is least trustworthy, including confidence that the language or runtime does not behave the way the judgement says. On a protected subject you do not get to be confident. Keep.

## Not grounds for \`drop\`
- It is about style, naming or readability and what it says is true.
- It reasons about runtime behaviour or code you cannot see.
- You disagree with its recommendation, or think the code is acceptable as written.
- You cannot confirm it. Unverifiable is not incorrect.
- It is speculative or low value. Those are not your call.
- It identifies a real problem but cites a slightly wrong line. Judge the claim, not the citation.

## \`revise\` — the one thing you may rewrite
Use it when the central claim holds but the judgement says more than the code backs, or points at more lines than the problem occupies.

- Text fields (\`title\`, \`lede\`, \`detail\`, \`ask\`) may only get shorter. Cut the part you cannot support; do not add a claim, a cause or a fix.
- \`line\` and \`endLine\` may only narrow to a range inside the current one.
- You cannot change the path, severity, kind, focus, options or sources, and you cannot add a judgement. If you think something is missing, say nothing about it.
- Anything you write is read by a person, so it follows the house voice below. Leave every field you are not changing as null.

## Method
For every judgement, in order, stopping at the first step that applies:
1. Protected subject? → keep.
2. Style or readability, and true? → keep.
3. Ground A? → drop.
4. Ground B? → drop.
5. Central claim holds but overstated or too wide? → revise.
6. Otherwise → keep.

Answer for every judgement, in the order given, with the analysis first. Name the \`path:line\` that proves any drop in both the analysis and the reason.

${voiceSection(config.voice?.extra)}`;
}

/** A line range is "narrower" when it lies inside the original and stays ordered. */
function narrowedRange(
  original: Pick<Judgement, "line" | "endLine">,
  revision: ReflectionRevision,
): { line: number; endLine: number | undefined } | null {
  if (revision.line === null && revision.endLine === null) return null;
  // Line 0 means no single line owns the concern; there is no range to narrow.
  if (original.line <= 0) return null;
  const oldEnd = original.endLine ?? original.line;
  const line = revision.line ?? original.line;
  const end = revision.endLine ?? oldEnd;
  if (line < original.line || end > oldEnd || line > end) return null;
  if (line === original.line && end === oldEnd) return null;
  return { line, endLine: end === line ? undefined : end };
}

const TEXT_FIELDS = ["title", "lede", "detail", "ask"] as const;

/**
 * Applies a reflection's verdicts to the judgements it was asked about.
 *
 * The model's output is a proposal, and this is where it is held to what
 * `revise` is allowed to be: a revision touches only the four text fields and
 * the line range, a text field is taken only if it is non-empty and no longer
 * than what it replaces, a range is taken only if it lies inside the old one.
 * A revision that changes nothing legal keeps the judgement as it was. A
 * judgement with no verdict, or one whose id the model invented, is kept.
 * The path, severity, kind, focus, options and sources are never copied from
 * the model at all.
 */
export function applyReflection(
  judgements: Judgement[],
  result: ReflectionResult,
): ReflectionApplied {
  const byId = new Map<string, ReflectionVerdict>();
  const ignored: string[] = [];
  const valid = new Set(judgements.map((_, i) => judgementId(i)));
  for (const verdict of result.verdicts) {
    if (!valid.has(verdict.id)) ignored.push(`${verdict.id}: no such judgement`);
    else if (byId.has(verdict.id)) ignored.push(`${verdict.id}: answered twice, first answer used`);
    else byId.set(verdict.id, verdict);
  }

  const kept: Judgement[] = [];
  const dropped: ReflectionDrop[] = [];
  let revised = 0;
  judgements.forEach((judgement, index) => {
    const verdict = byId.get(judgementId(index));
    if (!verdict || verdict.verdict === "keep") {
      kept.push(judgement);
      return;
    }
    if (verdict.verdict === "drop") {
      dropped.push({ judgement, reason: verdict.reason.trim() || "reflection dropped it without a reason" });
      return;
    }

    const revision = verdict.revision;
    if (!revision) {
      ignored.push(`${verdict.id}: revise with no revision, kept as written`);
      kept.push(judgement);
      return;
    }
    const next: Judgement = { ...judgement };
    let changed = false;
    for (const field of TEXT_FIELDS) {
      const text = revision[field]?.trim();
      if (text && text.length <= judgement[field].length && text !== judgement[field]) {
        next[field] = text;
        changed = true;
      }
    }
    const range = narrowedRange(judgement, revision);
    if (range) {
      next.line = range.line;
      if (range.endLine === undefined) delete next.endLine;
      else next.endLine = range.endLine;
      // A suggestion replaces exactly line..endLine. Over a different range
      // it would overwrite lines it was never written for.
      delete next.suggestion;
      changed = true;
    }
    if (changed) {
      revised++;
      kept.push(next);
    } else {
      ignored.push(`${verdict.id}: revision changed nothing it may change, kept as written`);
      kept.push(judgement);
    }
  });
  return { kept, dropped, revised, ignored };
}

/** What a run did with reflection, for the outcome and for eval. */
export interface ReflectionReport {
  status: "applied" | "failed" | "skipped";
  /** Why it failed or was skipped. */
  error?: string;
  judgementsChecked: number;
  kept: number;
  dropped: ReflectionDrop[];
  revised: number;
  ignored: string[];
  /** What reflection cost, when the provider said. Already counted into `record.run.costUsd`. */
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

/**
 * Runs one reflection call over every judgement and applies the answer.
 *
 * Never throws. A provider with no `reflect`, a call that fails, and an answer
 * that does not parse all leave every judgement in place and say so in the
 * report: losing a precision pass should never cost the review.
 */
export async function runReflection(opts: {
  provider: ReviewProvider;
  input: Omit<ReflectInput, "onUsage">;
  onProgress?: (msg: string) => void;
}): Promise<{ judgements: Judgement[]; report: ReflectionReport }> {
  const { provider, input, onProgress } = opts;
  const { judgements } = input;
  const report: ReflectionReport = {
    status: "applied",
    judgementsChecked: judgements.length,
    kept: judgements.length,
    dropped: [],
    revised: 0,
    ignored: [],
    costUsd: null,
    inputTokens: null,
    outputTokens: null,
  };
  if (!judgements.length) return { judgements, report: { ...report, status: "skipped", error: "nothing to check" } };
  if (!provider.reflect) {
    onProgress?.(`  reflection skipped: the ${provider.name} provider cannot reflect.`);
    return {
      judgements,
      report: { ...report, status: "skipped", error: `the ${provider.name} provider cannot reflect` },
    };
  }

  const add = (current: number | null, n: number | undefined) =>
    typeof n === "number" ? (current ?? 0) + n : current;
  onProgress?.(`  reflecting on ${judgements.length} judgement(s)…`);
  try {
    const raw = await provider.reflect(
      {
        ...input,
        onUsage: (usage) => {
          report.costUsd = add(report.costUsd, usage.costUsd);
          report.inputTokens = add(report.inputTokens, usage.inputTokens);
          report.outputTokens = add(report.outputTokens, usage.outputTokens);
        },
      },
      onProgress,
    );
    const applied = applyReflection(judgements, ReflectionResultSchema.parse(raw));
    report.kept = applied.kept.length;
    report.dropped = applied.dropped;
    report.revised = applied.revised;
    report.ignored = applied.ignored;
    onProgress?.(
      `  reflection kept ${applied.kept.length}, dropped ${applied.dropped.length}, rewrote ${applied.revised}.`,
    );
    return { judgements: applied.kept, report };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    onProgress?.(`  reflection failed; keeping every judgement: ${message}`);
    // Cost counted before the failure stays in the report: it was spent.
    return {
      judgements,
      report: { ...report, status: "failed", error: message, kept: judgements.length, dropped: [], revised: 0 },
    };
  }
}
