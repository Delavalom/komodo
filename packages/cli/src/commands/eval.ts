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
  // Every ref is parsed before the first run, so a malformed one fails here
  // rather than after earlier cases have spent quota.
  const refs = spec.cases.map((c) => parsePRRef(c.pr));
  const outDir = mkdtempSync(join(tmpdir(), "komodo-eval-"));
  // Ctrl-C mid-run must not leave record files behind in the temp directory.
  const onSigint = () => {
    rmSync(outDir, { recursive: true, force: true });
    process.exit(130);
  };
  process.once("SIGINT", onSigint);

  // `shown` is what a person opening the review sees; `raised` also counts
  // judgements the review dropped (below min_severity, or unanchorable). The
  // gap between them is a defect the reviewer found and the queue hid.
  const rows: string[][] = [
    ["case", "depth", "shown", "raised", "judgements", "passes", "cost", "seconds"],
  ];
  try {
    for (const [index, testCase] of spec.cases.entries()) {
      for (const depth of spec.depths) {
        console.log(pc.dim(`• ${testCase.pr} at ${depth}…`));
        const started = Date.now();
        const seconds = () => ((Date.now() - started) / 1000).toFixed(0);
        try {
          const outcome = await runReview({
            ref: refs[index],
            provider,
            config,
            github,
            post: false,
            outDir,
            onProgress: (m) => console.log(pc.dim(`    ${m}`)),
            depthRequest: { depth, by: "eval" },
            model: config.model,
          });
          const kept = outcome.record.result.judgements;
          const judgements = [...kept, ...outcome.droppedJudgements];
          const shown = scoreCase(kept, testCase.expect);
          const raised = scoreCase(judgements, testCase.expect);
          const run = outcome.record.run;
          rows.push([
            testCase.pr,
            depth,
            `${shown.hits.length}/${testCase.expect.length}`,
            `${raised.hits.length}/${testCase.expect.length}`,
            String(judgements.length),
            `${run?.passes ?? 1}/${DEPTH_PASSES[depth]}`,
            run?.costUsd != null ? `$${run.costUsd.toFixed(2)}` : "—",
            seconds(),
          ]);
          for (const missed of raised.missed) console.log(pc.yellow(`    missed: ${missed.name}`));
          const hidden = new Set(shown.missed.map((m) => m.name));
          for (const want of raised.hits) {
            if (hidden.has(want.name)) console.log(pc.yellow(`    not shown: ${want.name}`));
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.log(pc.yellow(`    failed: ${message}`));
          rows.push([testCase.pr, depth, "error", "error", "—", "—", "—", seconds()]);
          process.exitCode = 1;
        }
      }
    }
  } finally {
    process.off("SIGINT", onSigint);
    rmSync(outDir, { recursive: true, force: true });
  }

  const widths = rows[0].map((_, col) => Math.max(...rows.map((r) => r[col].length)));
  console.log("");
  for (const row of rows) console.log(row.map((cell, col) => cell.padEnd(widths[col])).join("  "));
}
