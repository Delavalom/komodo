import { join, resolve } from "node:path";
import pc from "picocolors";

import { aacr, KomodoConfigSchema, REVIEW_DEPTHS, resolveClaudeExecutable, type ReviewDepth } from "@komodo/core";

/**
 * `komodo-review eval aacr`: Komodo's preflight scored against AACR-Bench
 * (alibaba/aacr-bench) with the benchmark's own default metric, so the
 * numbers sit next to published ones.
 *
 * Never posts and never touches the store. Every reviewed instance is a real
 * model run, and so is every judge call that is not already cached.
 */

export interface AacrRunOptions {
  version: string;
  limit?: string;
  seed: string;
  stratify?: string;
  reviewer: string;
  ocrMode?: string;
  model: string;
  judgeModel: string;
  depth: string;
  experiment?: string;
  runId?: string;
  concurrency: string;
  resume?: boolean;
  preview?: boolean;
  score?: boolean;
  cacheDir?: string;
  out?: string;
}

function positiveInt(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${flag} must be a non-negative integer, got ${value}`);
  return n;
}

function slug(parts: (string | undefined)[]): string {
  return parts
    .filter(Boolean)
    .join("-")
    .replace(/[^A-Za-z0-9._+-]+/g, "_");
}

function createJudge(runDir: string, judgeModel: string) {
  const executable = resolveClaudeExecutable(KomodoConfigSchema.parse({}));
  const model = new aacr.ClaudeJudgeModel({ model: judgeModel, executable });
  return aacr.createCachedJudge(model, { cacheDir: join(runDir, "judge-cache") });
}

function printSummary(runDir: string, metrics: aacr.MetricsFile): void {
  const s = metrics.summary;
  const k = metrics.komodo;
  console.log("");
  console.log(
    `${pc.bold("precision")} ${s.file_semantic_match_rate.toFixed(3)}  ${pc.bold("recall")} ${s.file_semantic_recall_rate.toFixed(3)}  ${pc.bold("F1")} ${s.balanced_score.toFixed(3)}`,
  );
  console.log(
    pc.dim(
      `evaluated ${s.evaluated_instances}/${s.candidate_instances} (missing ${s.missing_instances}) · references ${s.expected_notes} · generated ${s.generated_notes} · ` +
        `avg tokens ${s.avg_input_tokens} in / ${s.avg_output_tokens} out · avg ${s.avg_duration_seconds}s · ` +
        `cost ${k.cost_usd === null ? "—" : `$${k.cost_usd.toFixed(2)}`}`,
    ),
  );
  console.log(
    pc.dim(`judge ${k.judge_model}: ${k.judge.calls} call(s), ${k.judge.cached} cached, ${k.judge_errors} error(s)`),
  );
  if (k.judge_errors) {
    console.log(pc.yellow(`  ${k.judge_errors} judge call(s) failed and were scored as no match; run \`eval aacr score\` to retry.`));
  }
  console.log(pc.dim(`→ ${join(runDir, "summary.md")}`));
}

export async function evalAacrCommand(opts: AacrRunOptions): Promise<void> {
  if (!aacr.isAacrVersion(opts.version)) throw new Error(`--version must be v1 or v2, got ${opts.version}`);
  if (opts.reviewer !== "komodo" && opts.reviewer !== "ocr") {
    throw new Error(`--reviewer must be komodo or ocr, got ${opts.reviewer}`);
  }
  if (!(REVIEW_DEPTHS as readonly string[]).includes(opts.depth)) {
    throw new Error(`--depth must be one of ${REVIEW_DEPTHS.join(", ")}, got ${opts.depth}`);
  }
  if (opts.stratify !== undefined && opts.stratify !== "language") {
    throw new Error(`--stratify only supports language, got ${opts.stratify}`);
  }
  if (opts.ocrMode !== undefined && opts.ocrMode !== "delegate" && opts.ocrMode !== "managed") {
    throw new Error(`--ocr-mode must be delegate or managed, got ${opts.ocrMode}`);
  }
  const limit = positiveInt(opts.limit, "--limit");
  const seed = positiveInt(opts.seed, "--seed") ?? 42;
  const concurrency = Math.max(1, positiveInt(opts.concurrency, "--concurrency") ?? 2);
  const experiments = (opts.experiment ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  const depth = opts.depth as ReviewDepth;
  const isKomodo = opts.reviewer === "komodo";

  const cacheDir = opts.cacheDir ? resolve(opts.cacheDir) : aacr.defaultAacrCacheDir();
  const datasetPath = await aacr.ensureAacrDataset(opts.version, cacheDir);
  const records = aacr.loadAacrRecords(datasetPath);
  const instances = aacr.sampleAacrInstances(records, {
    seed,
    limit,
    stratify: opts.stratify === "language" ? "language" : undefined,
  });
  const references = instances.reduce((a, i) => a + i.references.length, 0);
  console.log(
    pc.dim(
      `AACR-Bench ${opts.version}: ${instances.length} of ${records.length} pull requests (seed ${seed}${opts.stratify ? ", stratified by language" : ""}), ${references} references.`,
    ),
  );

  const preparer = new aacr.AacrRepoPreparer(cacheDir, { log: (m) => console.log(pc.dim(`    ${m}`)) });

  if (opts.preview) {
    // Repositories and diffs only: no reviewer, no judge, nothing written.
    let failed = 0;
    for (const instance of instances) {
      try {
        const prepared = await preparer.prepare(instance);
        const p = await aacr.previewInstance(instance, prepared.path);
        console.log(
          `${instance.id.padEnd(48)} ${instance.language.padEnd(10)} files ${p.reviewable}/${p.files}  +${p.additions} -${p.deletions}  refs ${instance.references.length}` +
            (p.referencesOnFilteredFiles ? pc.yellow(`  (${p.referencesOnFilteredFiles} on filtered files)`) : ""),
        );
      } catch (err) {
        failed++;
        console.log(pc.yellow(`${instance.id}: ${err instanceof Error ? err.message : String(err)}`));
      }
    }
    if (failed) process.exitCode = 1;
    return;
  }

  const runId =
    opts.runId ??
    slug([
      isKomodo ? undefined : opts.ocrMode ?? "delegate",
      opts.model,
      isKomodo ? depth : undefined,
      experiments.length ? experiments.join("+") : undefined,
      `s${seed}`,
      `n${limit ?? "all"}`,
      opts.stratify ? "strat" : undefined,
    ]);
  const runDir = resolve(opts.out ?? join(".komodo", "eval", "aacr"), opts.version, opts.reviewer, runId);

  const reviewer = isKomodo
    ? aacr.createKomodoReviewer({
        model: opts.model,
        depth,
        experiments,
        onProgress: (id, m) => console.log(pc.dim(`    [${id}] ${m}`)),
      })
    : await aacr.loadOcrReviewer({
        model: opts.model,
        mode: (opts.ocrMode as "delegate" | "managed" | undefined) ?? "delegate",
      });

  const manifest: aacr.RunManifest = {
    format: 1,
    benchmark: "aacr-bench",
    version: opts.version,
    aacrCommit: aacr.AACR_COMMIT,
    datasetSha256: aacr.AACR_DATASETS[opts.version].sha256,
    reviewer: reviewer.name,
    model: opts.model,
    ...(isKomodo ? { depth } : { ocrMode: opts.ocrMode ?? "delegate" }),
    experiments,
    seed,
    ...(limit !== undefined ? { limit } : {}),
    ...(opts.stratify ? { stratify: opts.stratify } : {}),
    createdAt: new Date().toISOString(),
    instanceIds: instances.map((i) => i.id),
  };
  aacr.openRunDir(runDir, manifest, instances, !!opts.resume);
  console.log(pc.dim(`run → ${runDir}`));

  const tally = await aacr.reviewInstances({
    runDir,
    instances,
    reviewer,
    prepare: (instance) => preparer.prepare(instance),
    concurrency,
    onEvent: (event) => {
      const id = event.instance.id;
      if (event.type === "skip") console.log(pc.dim(`• ${id}: already reviewed`));
      if (event.type === "start") console.log(pc.dim(`• ${id}…`));
      if (event.type === "done") {
        const r = event.run;
        console.log(
          `${pc.green("✓")} ${id}: ${r.comments.length} comment(s), ${r.durationSeconds.toFixed(0)}s` +
            (r.inputTokens !== undefined ? `, ${r.inputTokens} in / ${r.outputTokens ?? 0} out tokens` : "") +
            (typeof r.costUsd === "number" ? `, $${r.costUsd.toFixed(2)}` : ""),
        );
      }
      if (event.type === "error") console.log(pc.yellow(`✗ ${id}: ${event.error}`));
    },
  });
  console.log(pc.dim(`reviewed ${tally.reviewed}, skipped ${tally.skipped}, failed ${tally.failed}`));
  if (tally.failed) process.exitCode = 1;

  if (opts.score === false) return;
  const judge = createJudge(runDir, opts.judgeModel);
  const metrics = await aacr.scoreRun(runDir, judge, opts.judgeModel);
  printSummary(runDir, metrics);
}

/** Re-scores saved results; the judge is only asked what its cache does not already hold. */
export async function evalAacrScoreCommand(runDir: string, opts: { judgeModel: string }): Promise<void> {
  const dir = resolve(runDir);
  const judge = createJudge(dir, opts.judgeModel);
  const metrics = await aacr.scoreRun(dir, judge, opts.judgeModel);
  printSummary(dir, metrics);
}

export async function evalAacrCompareCommand(runDirs: string[]): Promise<void> {
  const rows = aacr.compareRuns(runDirs.map((d) => resolve(d)));
  const table = [
    ["reviewer", "experiments", "n", "precision", "recall", "F1", "avg tokens", "avg seconds", "cost"],
    ...rows.map((r) => [
      r.reviewer,
      r.experiments,
      String(r.n),
      r.precision.toFixed(3),
      r.recall.toFixed(3),
      r.f1.toFixed(3),
      String(r.avgTokens),
      String(r.avgSeconds),
      r.cost === null ? "—" : `$${r.cost.toFixed(2)}`,
    ]),
  ];
  const widths = table[0].map((_, col) => Math.max(...table.map((row) => row[col].length)));
  for (const row of table) console.log(row.map((cell, col) => cell.padEnd(widths[col])).join("  "));
}
