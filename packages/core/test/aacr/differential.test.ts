import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { createCachedJudge, type JudgeModel } from "../../src/aacr/judge.js";
import { openRunDir, reviewInstances, scoreRun, type MetricsFile, type RunManifest } from "../../src/aacr/run.js";
import type { Reviewer } from "../../src/aacr/types.js";
import { fixtureAnswers, fixtureInstances, fixtureRuns } from "./fixture.js";

/**
 * Komodo's port against AACR-Bench's own `evaluate()`.
 *
 * `official-golden.json` is what the Python evaluator (alibaba/aacr-bench@
 * c99d126, evaluation/) produced for this fixture, run offline by
 * official_evaluate.py with a fake judge client: the summary block, the
 * per-instance audit records, and every judge prompt it built. The TS side
 * must reproduce all three exactly.
 *
 * Set AACR_EVALUATOR=<path to aacr-bench/evaluation> to run the Python side
 * live as well (needs uv); UPDATE_AACR_GOLDEN=1 rewrites the golden from it.
 */

const GOLDEN = join(import.meta.dirname, "official-golden.json");
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const GEN = /-Generated Comment-\n\[L[^\]]*\] ([\s\S]*?)\n\n-Reference Comments-/;

async function buildAndScore(): Promise<{ runDir: string; metrics: MetricsFile; prompts: string[] }> {
  const runDir = mkdtempSync(join(tmpdir(), "komodo-aacr-diff-"));
  dirs.push(runDir);
  const manifest: RunManifest = {
    format: 1,
    benchmark: "aacr-bench",
    version: "v2",
    aacrCommit: "c99d126f17ada739d2b4d51d814b6c62a2aa4ab9",
    datasetSha256: "fixture",
    reviewer: "komodo",
    experiments: [],
    seed: 42,
    createdAt: "2026-11-16T00:00:00.000Z",
    instanceIds: fixtureInstances.map((i) => i.id),
  };
  openRunDir(runDir, manifest, fixtureInstances, false);
  const reviewer: Reviewer = {
    name: "komodo",
    async review(instance) {
      const run = fixtureRuns.find((r) => r.instanceId === instance.id);
      return run ?? { instanceId: instance.id, reviewer: "komodo", comments: [], durationSeconds: 1, error: "no result" };
    },
  };
  await reviewInstances({ runDir, instances: fixtureInstances, reviewer, prepare: async () => ({ path: runDir }), concurrency: 2 });

  const prompts: string[] = [];
  const model: JudgeModel = {
    name: "fake",
    async complete(prompt) {
      prompts.push(prompt);
      const note = GEN.exec(prompt)?.[1] ?? "";
      const answer = fixtureAnswers[note];
      if (answer === undefined) throw new Error(`no canned answer for ${note}`);
      if (answer === null) throw new Error("judge unavailable");
      return { text: answer };
    },
  };
  const judge = createCachedJudge(model, { retries: 0 });
  const metrics = await scoreRun(runDir, judge, "fake");
  return { runDir, metrics, prompts: prompts.sort() };
}

interface Golden {
  summary: Record<string, unknown>;
  eval_res: {
    instance_id: string;
    comments: { note: string; path: string; from_line: number | null; to_line: number | null; file_semantic_match: boolean }[];
    generated_comments: { note: string; path: string; from_line: number | null; to_line: number | null; matched_gt_indices: number[]; judge_reason: string; hit_new_gt: boolean }[];
  }[];
  prompts: string[];
}

/** The fields both sides define. Upstream's reason for a failed call is its own Chinese error text. */
function comparable(evalRes: Golden["eval_res"] | MetricsFile["eval_res"]) {
  return evalRes.map((r) => ({
    instance_id: r.instance_id,
    comments: r.comments.map((c) => ({ note: c.note, path: c.path, from_line: c.from_line, to_line: c.to_line, file_semantic_match: c.file_semantic_match })),
    generated_comments: r.generated_comments.map((g) => ({
      note: g.note,
      path: g.path,
      from_line: g.from_line,
      to_line: g.to_line,
      matched_gt_indices: g.matched_gt_indices,
      hit_new_gt: g.hit_new_gt,
      judge_reason: /^(judge error:|评估过程出错)/.test(g.judge_reason) ? "<error>" : g.judge_reason,
    })),
  }));
}

function runOfficial(runDir: string, evaluator: string): Golden {
  const answers = join(runDir, "answers.json");
  writeFileSync(answers, JSON.stringify(fixtureAnswers));
  const uv = existsSync(join(homedir(), ".local/bin/uv")) ? join(homedir(), ".local/bin/uv") : "uv";
  const out = execFileSync(
    uv,
    ["run", "--no-project", "--quiet", "--with", "typing_extensions", "python", join(import.meta.dirname, "official_evaluate.py"), evaluator, runDir, answers],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  return JSON.parse(out) as Golden;
}

describe("AACR-Bench differential: TS port vs official evaluate()", () => {
  it("matches the official summary, audit records and judge prompts exactly", async () => {
    const { runDir, metrics, prompts } = await buildAndScore();

    const evaluator = process.env.AACR_EVALUATOR;
    if (evaluator) {
      const live = runOfficial(runDir, evaluator);
      if (process.env.UPDATE_AACR_GOLDEN) writeFileSync(GOLDEN, `${JSON.stringify(live, null, 2)}\n`);
      expect(metrics.summary).toEqual(live.summary);
      expect(comparable(metrics.eval_res)).toEqual(comparable(live.eval_res));
      expect(prompts).toEqual(live.prompts);
    }

    const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as Golden;
    expect(metrics.summary).toEqual(golden.summary);
    expect(comparable(metrics.eval_res)).toEqual(comparable(golden.eval_res));
    expect(prompts).toEqual(golden.prompts);
  });

  it("lands on Python's half-even ties where JS rounding would not", async () => {
    const { metrics } = await buildAndScore();
    const s = metrics.summary;
    expect(s.generated_notes).toBe(16);
    expect(s.matched_generated_notes).toBe(5);
    expect(s.file_semantic_match_rate).toBe(0.312); // 0.3125; toFixed says 0.313
    expect(s.file_semantic_recall_rate).toBe(0.75);
    expect(s.balanced_score).toBe(0.441);
    expect(s.missing_instances).toBe(1);
    expect(s.evaluated_instances).toBe(2);
    expect(s.total_duration_seconds).toBe(19.47); // 12.35 (12.345 is 12.34500…06) + 7.12 (7.125 is a tie)
    expect(s.avg_input_tokens).toBe(1000); // 1000.5
    expect(s.avg_output_tokens).toBe(50); // 50.5
    expect(metrics.komodo.judge_errors).toBe(1);
  });
});
