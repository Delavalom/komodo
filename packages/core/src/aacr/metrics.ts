import { normalizeLineRange } from "./dataset.js";
import type { JudgeCall, JudgeFn } from "./judge.js";
import { pyRound } from "./python-compat.js";
import type { AacrReference, GeneratedComment } from "./types.js";

/**
 * AACR-Bench's file-level semantic coverage, ported from
 * `evaluation/judge.py::evaluate_file_level_semantics`, `compute_cr_statistics`
 * and `evaluation/evaluate.py::_compute_summary` (alibaba/aacr-bench@c99d126).
 * Field names stay snake_case where they appear in the official output so a
 * Komodo `metrics.json` and an official one can be diffed key by key.
 *
 * Everything here is pure apart from the injected judge.
 */

/** A comment in the shape the official judge module compares. */
export interface ScoredComment {
  note: string;
  path: string;
  from_line: number | null;
  to_line: number | null;
}

export interface GeneratedMatchRecord extends ScoredComment {
  /** Indices into the instance's reference list, duplicates kept as upstream keeps them. */
  matched_gt_indices: number[];
  judge_reason: string;
  /** Covered at least one reference no earlier comment had covered. */
  hit_new_gt: boolean;
}

/** `build_reference_comments`. */
export function toScoredReferences(refs: AacrReference[]): ScoredComment[] {
  return refs.map((r) => {
    const range = normalizeLineRange(r.fromLine, r.toLine);
    return { note: r.note, path: r.path, from_line: range.fromLine ?? null, to_line: range.toLine ?? null };
  });
}

/**
 * The generated side, as the official OCR builder reads a result: the body is
 * the note, trimmed, and a comment with no body is not a comment at all.
 */
export function toScoredGenerated(comments: GeneratedComment[]): ScoredComment[] {
  const out: ScoredComment[] = [];
  for (const c of comments) {
    const note = (c.body ?? "").trim();
    if (!note) continue;
    const range = normalizeLineRange(c.fromLine, c.toLine);
    out.push({ note, path: c.path ?? "", from_line: range.fromLine ?? null, to_line: range.toLine ?? null });
  }
  return out;
}

/** `_normalize_path`. */
export function normalizePath(path: string): string {
  if (!path) return "";
  return path.replaceAll("\\/", "/").replaceAll("\\", "/");
}

/** `_strip_thinking_tags`. */
export function stripThinkingTags(text: string): string {
  if (!text) return "";
  return text
    .replace(/<details>[\s\S]*?<\/details>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** `f"{from_line}-{to_line}" if from_line and to_line else "?"` — a zero counts as missing. */
function lineString(from: number | null, to: number | null): string {
  return from && to ? `${from}-${to}` : "?";
}

export interface FileLevelResult {
  /** References covered by at least one generated comment. */
  coveredReferences: number;
  /** Generated comments that covered a reference nothing earlier had (`hit_new_gt`). */
  matchedGenerated: number;
  records: GeneratedMatchRecord[];
  /** Per reference, whether anything covered it (`file_semantic_match`). */
  referenceCovered: boolean[];
  /** Judge calls that ended in an error and were scored as no match. */
  judgeErrors: number;
}

/**
 * `evaluate_file_level_semantics`. Comments are grouped by normalised path;
 * each generated comment on a file that has references is judged once against
 * all of them; then, walking the generated comments in record order — by
 * file, in the order files first appear, then generation order within a file
 * — a comment counts toward precision only if it covers a reference nothing
 * before it covered.
 */
export async function evaluateFileLevel(
  references: ScoredComment[],
  generated: ScoredComment[],
  judge: JudgeFn,
): Promise<FileLevelResult> {
  const refsByPath = new Map<string, { index: number; note: string; lines: string }[]>();
  references.forEach((ref, index) => {
    if (!ref.note) return;
    const note = stripThinkingTags(ref.note);
    if (!note) return;
    const path = normalizePath(ref.path);
    if (!path) return;
    const list = refsByPath.get(path) ?? [];
    list.push({ index, note, lines: lineString(ref.from_line, ref.to_line) });
    refsByPath.set(path, list);
  });

  const gensByPath = new Map<string, { note: string; lines: string; record: GeneratedMatchRecord }[]>();
  for (const gen of generated) {
    if (!gen.note) continue;
    const note = stripThinkingTags(gen.note);
    if (!note) continue;
    const path = normalizePath(gen.path);
    if (!path) continue;
    const list = gensByPath.get(path) ?? [];
    list.push({
      note,
      lines: lineString(gen.from_line, gen.to_line),
      record: {
        note: gen.note,
        path,
        from_line: gen.from_line,
        to_line: gen.to_line,
        matched_gt_indices: [],
        judge_reason: "",
        hit_new_gt: false,
      },
    });
    gensByPath.set(path, list);
  }

  let judgeErrors = 0;
  const tasks: Promise<void>[] = [];
  for (const [path, refs] of refsByPath) {
    for (const entry of gensByPath.get(path) ?? []) {
      const call: JudgeCall = {
        path,
        genNote: entry.note,
        genLines: entry.lines,
        refNotes: refs.map((r) => r.note),
        refLines: refs.map((r) => r.lines),
      };
      tasks.push(
        judge(call).then((verdict) => {
          if (verdict.error) judgeErrors++;
          entry.record.matched_gt_indices = verdict.matched.map((n) => refs[n - 1].index);
          entry.record.judge_reason = Array.from(verdict.reason).slice(0, 500).join("");
        }),
      );
    }
  }
  await Promise.all(tasks);

  const records = [...gensByPath.values()].flat().map((e) => e.record);
  const coveredByAny = new Set(records.flatMap((r) => r.matched_gt_indices));
  const covered = new Set<number>();
  let matchedGenerated = 0;
  for (const record of records) {
    const fresh = record.matched_gt_indices.filter((i) => !covered.has(i));
    record.hit_new_gt = fresh.length > 0;
    if (record.hit_new_gt) {
      matchedGenerated++;
      for (const i of record.matched_gt_indices) covered.add(i);
    }
  }

  return {
    coveredReferences: coveredByAny.size,
    matchedGenerated,
    records,
    referenceCovered: references.map((_, i) => coveredByAny.has(i)),
    judgeErrors,
  };
}

/** One instance's scored outcome, the `eval_res[]` entry plus its counts. */
export interface InstanceScore {
  instance_id: string;
  repo: string;
  expected_notes: number;
  generated_notes: number;
  matched_generated_notes: number;
  matched_file_semantic_notes: number;
  judge_errors: number;
  comments: (ScoredComment & { file_semantic_match: boolean })[];
  generated_comments: GeneratedMatchRecord[];
}

/**
 * One instance, scored as `evaluate()` scores it: `expected_notes` counts
 * references with a note, `generated_notes` counts generated comments with a
 * note — including ones the judge never sees (no path, or nothing left after
 * stripping), which can only lower precision, as upstream.
 */
export async function scoreInstance(
  instance: { id: string; repo: string; references: AacrReference[] },
  comments: GeneratedComment[],
  judge: JudgeFn,
): Promise<InstanceScore> {
  const references = toScoredReferences(instance.references);
  const generated = toScoredGenerated(comments);
  const level = await evaluateFileLevel(references, generated, judge);
  return {
    instance_id: instance.id,
    repo: instance.repo,
    expected_notes: references.filter((r) => r.note).length,
    generated_notes: generated.filter((g) => g.note).length,
    matched_generated_notes: level.matchedGenerated,
    matched_file_semantic_notes: level.referenceCovered.filter(Boolean).length,
    judge_errors: level.judgeErrors,
    comments: references.map((r, i) => ({ ...r, file_semantic_match: level.referenceCovered[i] })),
    generated_comments: level.records,
  };
}

/** Run-level usage per evaluated instance, as `_extract_usage_from_result` reads it. */
export interface InstanceUsage {
  durationSeconds: number;
  inputTokens: number;
  outputTokens: number;
}

/** `_compute_summary` (with `_base_summary`), the official `summary` block. */
export interface AacrSummary {
  total_instances: number;
  candidate_instances: number;
  evaluated_instances: number;
  missing_instances: number;
  expected_notes: number;
  generated_notes: number;
  total_duration_seconds: number;
  avg_duration_seconds: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  avg_input_tokens: number;
  avg_output_tokens: number;
  matched_generated_notes: number;
  matched_file_semantic_notes: number;
  /** Precision. */
  file_semantic_match_rate: number;
  /** Recall. */
  file_semantic_recall_rate: number;
  /** Harmonic mean of the two rounded rates. */
  balanced_score: number;
}

/** `_compute_balanced_score`: on the already-rounded rates, then rounded again. */
export function balancedScore(precision: number, recall: number): number {
  if (precision + recall <= 0) return 0;
  return pyRound((2 * precision * recall) / (precision + recall), 3);
}

/**
 * The summary over every evaluated instance. Missing instances are counted
 * and excluded from every denominator; rates are rounded to three places with
 * Python's rounding.
 */
export function summarize(input: {
  totalInstances: number;
  candidateInstances: number;
  missingInstances: number;
  scores: InstanceScore[];
  usage: InstanceUsage[];
}): AacrSummary {
  const evaluated = input.scores.length;
  const sum = (f: (s: InstanceScore) => number) => input.scores.reduce((a, s) => a + f(s), 0);
  const expected = sum((s) => s.expected_notes);
  const generated = sum((s) => s.generated_notes);
  const matchedGenerated = sum((s) => s.matched_generated_notes);
  const matchedGt = sum((s) => s.matched_file_semantic_notes);
  // Durations are summed as floats, then rounded once, as upstream.
  const totalDuration = input.usage.reduce((a, u) => a + (u.durationSeconds || 0), 0);
  const totalIn = input.usage.reduce((a, u) => a + (u.inputTokens || 0), 0);
  const totalOut = input.usage.reduce((a, u) => a + (u.outputTokens || 0), 0);
  const precision = generated ? pyRound(matchedGenerated / generated, 3) : 0;
  const recall = expected ? pyRound(matchedGt / expected, 3) : 0;
  return {
    total_instances: input.totalInstances,
    candidate_instances: input.candidateInstances,
    evaluated_instances: evaluated,
    missing_instances: input.missingInstances,
    expected_notes: expected,
    generated_notes: generated,
    total_duration_seconds: pyRound(totalDuration, 2),
    avg_duration_seconds: evaluated ? pyRound(totalDuration / evaluated, 2) : 0,
    total_input_tokens: totalIn,
    total_output_tokens: totalOut,
    total_tokens: totalIn + totalOut,
    avg_input_tokens: evaluated ? pyRound(totalIn / evaluated) : 0,
    avg_output_tokens: evaluated ? pyRound(totalOut / evaluated) : 0,
    matched_generated_notes: matchedGenerated,
    matched_file_semantic_notes: matchedGt,
    file_semantic_match_rate: precision,
    file_semantic_recall_rate: recall,
    balanced_score: balancedScore(precision, recall),
  };
}
