import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { CachedJudge, JudgeStats } from "./judge.js";
import { scoreInstance, summarize, type AacrSummary, type InstanceScore, type InstanceUsage } from "./metrics.js";
import { pyRound } from "./python-compat.js";
import { SEVERITIES } from "../schema.js";
import type { AacrInstance, GeneratedComment, Reviewer, ReviewerRun } from "./types.js";

/**
 * A run directory, `.komodo/eval/aacr/<version>/<reviewer>/<run-id>/`:
 *
 *   run.json              what was run: dataset, selection, reviewer settings
 *   instances.json        the selected instances, references included
 *   results/<id>.json     one finished review (the instance and its ReviewerRun)
 *   errors/<id>.json      the latest failed attempt; retried on --resume
 *   official/<id>.json    the same result in the shape AACR-Bench's evaluate.py reads
 *   official/dataset.jsonl the selection in AACR-Bench's standard schema
 *   judge-cache/          judge answers by model and prompt
 *   metrics.json          { ex_info, summary, eval_res, komodo } — summary keys as upstream
 *   summary.md            the same numbers for a person
 */
export interface RunManifest {
  format: 1;
  benchmark: "aacr-bench";
  version: string;
  aacrCommit: string;
  datasetSha256: string;
  reviewer: string;
  model?: string;
  depth?: string;
  ocrMode?: string;
  /** Komodo reviewer overrides of its default configuration, when given. */
  profile?: string;
  minSeverity?: string;
  experiments: string[];
  seed: number;
  limit?: number;
  stratify?: string;
  createdAt: string;
  instanceIds: string[];
}

export interface StoredResult {
  instance: AacrInstance;
  run: ReviewerRun;
  startedAt: string;
}

/** Instance ids become file names; `/` cannot appear in one. */
export function resultFileName(instanceId: string): string {
  return `${instanceId.replaceAll("/", "__")}.json`;
}

function writeJsonAtomic(path: string, value: unknown): void {
  const partial = `${path}.${process.pid}.part`;
  writeFileSync(partial, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(partial, path);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/**
 * A result as `evaluate.py` reads one for any reviewer that is not `claude` or
 * `codex`: comments under `review.comments` with `path`, `start_line`,
 * `end_line` and `content`, tokens under `review.summary`, and
 * `duration_seconds` rounded to two places as the official writers round it.
 */
export function toOfficialResult(stored: StoredResult): Record<string, unknown> {
  const { instance, run } = stored;
  return {
    instance_id: instance.id,
    repo: instance.repo,
    base_commit: instance.baseCommit,
    head_commit: instance.headCommit,
    reviewer: run.reviewer,
    started_at: stored.startedAt,
    duration_seconds: pyRound(run.durationSeconds, 2),
    review: {
      comments: run.comments.map((c) => ({
        path: c.path,
        start_line: c.fromLine ?? null,
        end_line: c.toLine ?? c.fromLine ?? null,
        content: c.body,
      })),
      summary: { input_tokens: run.inputTokens ?? 0, output_tokens: run.outputTokens ?? 0 },
    },
  };
}

/** One line of the official standard-format JSONL (`ReviewInstance.to_dict`). */
export function toOfficialInstance(instance: AacrInstance): Record<string, unknown> {
  return {
    instance_id: instance.id,
    repo: instance.repo,
    base_commit: instance.baseCommit,
    head_commit: instance.headCommit,
    reference_comments: instance.references.map((r) => ({
      path: r.path,
      start_line: r.fromLine ?? null,
      end_line: r.toLine ?? null,
      text: r.note,
      ...(r.side ? { side: r.side } : {}),
    })),
  };
}

export function readManifest(runDir: string): RunManifest {
  const path = join(runDir, "run.json");
  if (!existsSync(path)) throw new Error(`${runDir} is not an AACR run directory (no run.json).`);
  return readJson<RunManifest>(path);
}

export function readInstances(runDir: string): AacrInstance[] {
  return readJson<AacrInstance[]>(join(runDir, "instances.json"));
}

export function readResult(runDir: string, instanceId: string): StoredResult | null {
  const path = join(runDir, "results", resultFileName(instanceId));
  return existsSync(path) ? readJson<StoredResult>(path) : null;
}

/**
 * Creates a run directory, or reopens one to resume it. Reopening checks that
 * the selection and the reviewer's settings are the ones it was started with:
 * resuming a different run into the same directory would mix two reviewers'
 * results under one score.
 */
export function openRunDir(runDir: string, manifest: RunManifest, instances: AacrInstance[], resume: boolean): void {
  const manifestPath = join(runDir, "run.json");
  if (existsSync(manifestPath)) {
    if (!resume) {
      throw new Error(`${runDir} already holds a run. Pass --resume to continue it, or --run-id for a new one.`);
    }
    const existing = readManifest(runDir);
    const fields = ["version", "datasetSha256", "reviewer", "model", "depth", "ocrMode", "seed", "limit", "stratify"] as const;
    const differs = fields.filter((f) => existing[f] !== manifest[f]);
    if (JSON.stringify(existing.experiments) !== JSON.stringify(manifest.experiments)) differs.push("experiments" as never);
    if (JSON.stringify(existing.instanceIds) !== JSON.stringify(manifest.instanceIds)) differs.push("instanceIds" as never);
    if (differs.length) {
      throw new Error(`Cannot resume ${runDir}: it was started with different ${differs.join(", ")}.`);
    }
    return;
  }
  for (const sub of ["results", "errors", "official"]) mkdirSync(join(runDir, sub), { recursive: true });
  writeJsonAtomic(manifestPath, manifest);
  writeJsonAtomic(join(runDir, "instances.json"), instances);
  writeFileSync(
    join(runDir, "official", "dataset.jsonl"),
    instances.map((i) => JSON.stringify(toOfficialInstance(i))).join("\n") + "\n",
  );
}

/** Runs `fn` over `items`, at most `n` at a time, keeping order in the result. */
export async function mapPool<T, R>(items: T[], n: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return out;
}

export type ReviewEvent =
  | { type: "skip"; instance: AacrInstance }
  | { type: "start"; instance: AacrInstance }
  | { type: "done"; instance: AacrInstance; run: ReviewerRun }
  | { type: "error"; instance: AacrInstance; error: string };

/**
 * Reviews every instance without a result yet. A finished review is written
 * the moment it finishes, so an interrupted run loses only what was in
 * flight; a failed one goes to `errors/` and is tried again next time.
 */
export async function reviewInstances(opts: {
  runDir: string;
  instances: AacrInstance[];
  reviewer: Reviewer;
  prepare: (instance: AacrInstance) => Promise<{ path: string }>;
  concurrency: number;
  onEvent?: (event: ReviewEvent) => void;
}): Promise<{ reviewed: number; skipped: number; failed: number }> {
  const tally = { reviewed: 0, skipped: 0, failed: 0 };
  await mapPool(opts.instances, opts.concurrency, async (instance) => {
    if (readResult(opts.runDir, instance.id)) {
      tally.skipped++;
      opts.onEvent?.({ type: "skip", instance });
      return;
    }
    opts.onEvent?.({ type: "start", instance });
    const startedAt = new Date().toISOString();
    let run: ReviewerRun;
    try {
      const prepared = await opts.prepare(instance);
      run = await opts.reviewer.review(instance, prepared.path);
    } catch (err) {
      run = {
        instanceId: instance.id,
        reviewer: opts.reviewer.name,
        comments: [],
        durationSeconds: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    const stored: StoredResult = { instance, run, startedAt };
    const name = resultFileName(instance.id);
    if (run.error) {
      tally.failed++;
      writeJsonAtomic(join(opts.runDir, "errors", name), stored);
      opts.onEvent?.({ type: "error", instance, error: run.error });
      return;
    }
    writeJsonAtomic(join(opts.runDir, "official", name), toOfficialResult(stored));
    writeJsonAtomic(join(opts.runDir, "results", name), stored);
    tally.reviewed++;
    opts.onEvent?.({ type: "done", instance, run });
  });
  return tally;
}

export interface MetricsFile {
  ex_info: {
    start_time: string;
    results_dir: string;
    reviewer: string;
    limit: number | null;
    score_mode: "file_semantic";
    missing_instance_ids: string[];
  };
  summary: AacrSummary;
  eval_res: InstanceScore[];
  /** Komodo's own additions, kept out of `summary` so that block diffs cleanly against upstream. */
  komodo: {
    version: string;
    model?: string;
    depth?: string;
    experiments: string[];
    judge_model: string;
    cost_usd: number | null;
    judge: JudgeStats;
    judge_errors: number;
    by_language: Record<string, AacrSummary>;
  };
}

/**
 * Scores every finished result in a run. Instances without one are missing,
 * excluded from every denominator and listed, as upstream treats a result
 * file that is not there. Judge answers come from the run's cache when it has
 * them, so scoring a run twice asks the judge nothing the second time.
 */
/**
 * A subset of a run's comments to score instead of all of them, by the
 * details the reviewer recorded. Comments without details (another
 * reviewer's) are kept. Written beside the full score as
 * `metrics-<tag>.json` / `summary-<tag>.md`; the full score is untouched.
 */
export interface ScoreSubset {
  tag: string;
  onlyFocus?: string[];
  minSeverity?: (typeof SEVERITIES)[number];
}

/** Which of a stored run's comments a subset keeps. */
export function subsetComments(run: ReviewerRun, subset?: ScoreSubset): GeneratedComment[] {
  if (!subset || !run.details || run.details.length !== run.comments.length) return run.comments;
  const floor = subset.minSeverity ? SEVERITIES.indexOf(subset.minSeverity) : SEVERITIES.length - 1;
  return run.comments.filter((_, i) => {
    const d = run.details![i];
    if (subset.onlyFocus?.length && (!d.focus || !subset.onlyFocus.includes(d.focus))) return false;
    if (d.severity && SEVERITIES.indexOf(d.severity as (typeof SEVERITIES)[number]) > floor) return false;
    return true;
  });
}

export async function scoreRun(
  runDir: string,
  judge: CachedJudge,
  judgeModel: string,
  subset?: ScoreSubset,
): Promise<MetricsFile> {
  const manifest = readManifest(runDir);
  const instances = readInstances(runDir);
  const byId = new Map(instances.map((i) => [i.id, i]));
  const selected = manifest.instanceIds.map((id) => {
    const instance = byId.get(id);
    if (!instance) throw new Error(`instances.json has no ${id}`);
    return instance;
  });

  const scored = await mapPool(selected, selected.length || 1, async (instance) => {
    const stored = readResult(runDir, instance.id);
    if (!stored) return null;
    const score = await scoreInstance(instance, subsetComments(stored.run, subset), judge.judge);
    const usage: InstanceUsage = {
      durationSeconds: pyRound(stored.run.durationSeconds, 2),
      inputTokens: stored.run.inputTokens ?? 0,
      outputTokens: stored.run.outputTokens ?? 0,
    };
    return { instance, score, usage, cost: stored.run.costUsd ?? null };
  });

  const present = scored.filter((s): s is NonNullable<typeof s> => s !== null);
  const missing = selected.filter((_, i) => scored[i] === null).map((i) => i.id);
  const summaryOf = (rows: typeof present, total: number, missingCount: number) =>
    summarize({
      totalInstances: total,
      candidateInstances: total,
      missingInstances: missingCount,
      scores: rows.map((r) => r.score),
      usage: rows.map((r) => r.usage),
    });

  const languages = [...new Set(selected.map((i) => i.language))].sort();
  const byLanguage: Record<string, AacrSummary> = {};
  for (const language of languages) {
    const ofLanguage = selected.filter((i) => i.language === language);
    const rows = present.filter((r) => r.instance.language === language);
    byLanguage[language] = summaryOf(rows, ofLanguage.length, ofLanguage.length - rows.length);
  }

  const costs = present.map((r) => r.cost).filter((c): c is number => typeof c === "number");
  const metrics: MetricsFile = {
    ex_info: {
      start_time: new Date().toISOString(),
      results_dir: join(runDir, "official"),
      reviewer: manifest.reviewer,
      limit: manifest.limit ?? null,
      score_mode: "file_semantic",
      missing_instance_ids: missing,
    },
    summary: summaryOf(present, selected.length, missing.length),
    eval_res: present.map((r) => r.score),
    komodo: {
      version: manifest.version,
      model: manifest.model,
      depth: manifest.depth,
      experiments: manifest.experiments,
      judge_model: judgeModel,
      cost_usd: costs.length ? costs.reduce((a, b) => a + b, 0) : null,
      judge: { ...judge.stats },
      judge_errors: present.reduce((a, r) => a + r.score.judge_errors, 0),
      by_language: byLanguage,
    },
  };
  const suffix = subset ? `-${subset.tag}` : "";
  writeJsonAtomic(join(runDir, `metrics${suffix}.json`), metrics);
  writeFileSync(join(runDir, `summary${suffix}.md`), renderSummaryMarkdown(manifest, metrics));
  return metrics;
}

const pct = (x: number) => x.toFixed(3);

/** The run's numbers for a person, with the selection that produced them. */
export function renderSummaryMarkdown(manifest: RunManifest, metrics: MetricsFile): string {
  const s = metrics.summary;
  const k = metrics.komodo;
  const lines = [
    `# AACR-Bench ${manifest.version} — ${manifest.reviewer}`,
    "",
    `- Selection: seed ${manifest.seed}, ${manifest.limit ?? "all"} instances${manifest.stratify ? `, stratified by ${manifest.stratify}` : ""}; dataset alibaba/aacr-bench@${manifest.aacrCommit.slice(0, 7)} (sha256 ${manifest.datasetSha256.slice(0, 12)}…)`,
    `- Reviewer: ${manifest.reviewer}${manifest.model ? ` on ${manifest.model}` : ""}${manifest.depth ? `, depth ${manifest.depth}` : ""}${manifest.ocrMode ? `, mode ${manifest.ocrMode}` : ""}${manifest.experiments.length ? `, experiments ${manifest.experiments.join(", ")}` : ""}`,
    `- Judge: ${k.judge_model} (file-level semantic coverage, the official default metric)`,
    "",
    "| precision | recall | balanced (F1) | evaluated | missing | references | generated | avg tokens in/out | avg seconds | cost |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    `| ${pct(s.file_semantic_match_rate)} | ${pct(s.file_semantic_recall_rate)} | ${pct(s.balanced_score)} | ${s.evaluated_instances} | ${s.missing_instances} | ${s.expected_notes} | ${s.generated_notes} | ${s.avg_input_tokens} / ${s.avg_output_tokens} | ${s.avg_duration_seconds} | ${k.cost_usd === null ? "—" : `$${k.cost_usd.toFixed(2)}`} |`,
    "",
  ];
  if (k.judge_errors) {
    lines.push(`> ${k.judge_errors} judge call(s) failed and were scored as no match, as upstream scores them. Re-score to retry them.`, "");
  }
  if (metrics.ex_info.missing_instance_ids.length) {
    lines.push(`Missing (no result, excluded from every denominator): ${metrics.ex_info.missing_instance_ids.join(", ")}`, "");
  }
  lines.push("## By language", "", "| language | n | precision | recall | F1 |", "| --- | --- | --- | --- | --- |");
  for (const [language, ls] of Object.entries(k.by_language)) {
    lines.push(`| ${language} | ${ls.evaluated_instances} | ${pct(ls.file_semantic_match_rate)} | ${pct(ls.file_semantic_recall_rate)} | ${pct(ls.balanced_score)} |`);
  }
  lines.push("", "## Instances", "", "| instance | references | generated | new hits | covered |", "| --- | --- | --- | --- | --- |");
  for (const r of metrics.eval_res) {
    lines.push(`| ${r.instance_id} | ${r.expected_notes} | ${r.generated_notes} | ${r.matched_generated_notes} | ${r.matched_file_semantic_notes} |`);
  }
  return `${lines.join("\n")}\n`;
}

export interface CompareRow {
  runDir: string;
  reviewer: string;
  experiments: string;
  n: number;
  precision: number;
  recall: number;
  f1: number;
  avgTokens: number;
  avgSeconds: number;
  cost: number | null;
}

/** One row per scored run directory, for `eval aacr compare`. */
export function compareRuns(runDirs: string[]): CompareRow[] {
  return runDirs.map((runDir) => {
    const path = join(runDir, "metrics.json");
    if (!existsSync(path)) throw new Error(`${runDir} has no metrics.json; score it first with \`eval aacr score\`.`);
    const m = readJson<MetricsFile>(path);
    const manifest = readManifest(runDir);
    const reviewer = [manifest.reviewer, manifest.model, manifest.depth, manifest.ocrMode].filter(Boolean).join(" ");
    return {
      runDir,
      reviewer,
      experiments: manifest.experiments.join(",") || "—",
      n: m.summary.evaluated_instances,
      precision: m.summary.file_semantic_match_rate,
      recall: m.summary.file_semantic_recall_rate,
      f1: m.summary.balanced_score,
      avgTokens: m.summary.avg_input_tokens + m.summary.avg_output_tokens,
      avgSeconds: m.summary.avg_duration_seconds,
      cost: m.komodo?.cost_usd ?? null,
    };
  });
}

/** Result files present in a run, for a caller that wants a count without scoring. */
export function countResults(runDir: string): number {
  const dir = join(runDir, "results");
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).length : 0;
}
