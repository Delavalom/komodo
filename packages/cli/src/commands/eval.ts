import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import pc from "picocolors";
import { parse } from "yaml";

import {
  createProvider,
  DEPTH_PASSES,
  EvalFileSchema,
  GitHubClient,
  loadConfig,
  parsePRRef,
  runReview,
  scoreCase,
} from "@komodo/core";

/**
 * Runs each case at each depth and reports which expected defects were raised.
 *
 * Never posts, never writes to the queue: this measures the reviewer, it does
 * not review anything anyone is waiting on. Every row is a real model run.
 *
 * `runReview` saves a record JSON for each run, so those go to a scratch
 * directory that is removed at the end rather than into the caller's
 * `.komodo/reviews`. A run that fails is reported and the eval carries on —
 * the earlier rows already cost quota — and the exit code says it happened.
 */
export async function evalCommand(
  file: string,
  opts: { provider?: string; model?: string },
): Promise<void> {
  // Read and validated before anything is spent, so a bad file or a bad
  // pattern in it is an error here, not after the first model run.
  const spec = EvalFileSchema.parse(parse(readFileSync(resolve(file), "utf8")));
  const { config } = loadConfig();
  if (opts.model) config.model = opts.model;
  const provider = createProvider(config, opts.provider);
  const github = new GitHubClient();
  const outDir = mkdtempSync(join(tmpdir(), "komodo-eval-"));

  const rows: string[][] = [["case", "depth", "found", "judgements", "passes", "cost", "seconds"]];
  try {
    for (const testCase of spec.cases) {
      for (const depth of spec.depths) {
        console.log(pc.dim(`• ${testCase.pr} at ${depth}…`));
        const started = Date.now();
        const seconds = () => ((Date.now() - started) / 1000).toFixed(0);
        try {
          const outcome = await runReview({
            ref: parsePRRef(testCase.pr),
            provider,
            config,
            github,
            post: false,
            outDir,
            depthRequest: { depth, by: "eval" },
            model: config.model,
          });
          const judgements = [...outcome.record.result.judgements, ...outcome.droppedJudgements];
          const score = scoreCase(judgements, testCase.expect);
          const run = outcome.record.run;
          rows.push([
            testCase.pr,
            depth,
            `${score.hits.length}/${testCase.expect.length}`,
            String(judgements.length),
            `${run?.passes ?? 1}/${DEPTH_PASSES[depth]}`,
            run?.costUsd != null ? `$${run.costUsd.toFixed(2)}` : "—",
            seconds(),
          ]);
          for (const missed of score.missed) console.log(pc.yellow(`    missed: ${missed.name}`));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.log(pc.yellow(`    failed: ${message}`));
          rows.push([testCase.pr, depth, "error", "—", "—", "—", seconds()]);
          process.exitCode = 1;
        }
      }
    }
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }

  const widths = rows[0].map((_, col) => Math.max(...rows.map((r) => r[col].length)));
  console.log("");
  for (const row of rows) console.log(row.map((cell, col) => cell.padEnd(widths[col])).join("  "));
}
