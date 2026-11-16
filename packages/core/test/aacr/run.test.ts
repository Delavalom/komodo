import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { createCachedJudge, type JudgeModel } from "../../src/aacr/judge.js";
import {
  compareRuns,
  openRunDir,
  readResult,
  reviewInstances,
  scoreRun,
  toOfficialInstance,
  toOfficialResult,
  type RunManifest,
} from "../../src/aacr/run.js";
import type { Reviewer } from "../../src/aacr/types.js";
import { fixtureAnswers, fixtureInstances, fixtureRuns } from "./fixture.js";

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function newRunDir(): string {
  const d = mkdtempSync(join(tmpdir(), "komodo-aacr-run-"));
  dirs.push(d);
  return join(d, "run");
}

const manifest = (over: Partial<RunManifest> = {}): RunManifest => ({
  format: 1,
  benchmark: "aacr-bench",
  version: "v2",
  aacrCommit: "c99d126f17ada739d2b4d51d814b6c62a2aa4ab9",
  datasetSha256: "x",
  reviewer: "komodo",
  model: "m",
  depth: "standard",
  experiments: ["pin"],
  seed: 42,
  limit: 3,
  createdAt: "2026-11-16T00:00:00.000Z",
  instanceIds: fixtureInstances.map((i) => i.id),
  ...over,
});

function countingReviewer(fail: Set<string> = new Set()): Reviewer & { seen: string[] } {
  const seen: string[] = [];
  return {
    name: "komodo",
    seen,
    async review(instance, repoPath) {
      seen.push(`${instance.id}@${repoPath}`);
      const run = fixtureRuns.find((r) => r.instanceId === instance.id);
      if (!run || fail.has(instance.id)) {
        return { instanceId: instance.id, reviewer: "komodo", comments: [], durationSeconds: 1, error: "boom" };
      }
      return run;
    },
  };
}

const GEN = /-Generated Comment-\n\[L[^\]]*\] ([\s\S]*?)\n\n-Reference Comments-/;
function cannedModel(): JudgeModel & { asked: number } {
  const m = {
    name: "fake",
    asked: 0,
    async complete(prompt: string) {
      m.asked++;
      const answer = fixtureAnswers[GEN.exec(prompt)?.[1] ?? ""];
      if (answer == null) throw new Error("down");
      return { text: answer };
    },
  };
  return m;
}

describe("reviewInstances", () => {
  it("writes results, official files and errors, and resume skips only finished ones", async () => {
    const runDir = newRunDir();
    openRunDir(runDir, manifest(), fixtureInstances, false);
    const first = countingReviewer(new Set(["acme__gadgets@bbbbbbb"]));
    const prepare = async (i: { id: string }) => ({ path: `/wt/${i.id}` });
    expect(await reviewInstances({ runDir, instances: fixtureInstances, reviewer: first, prepare, concurrency: 2 })).toEqual({
      reviewed: 1,
      skipped: 0,
      failed: 2,
    });
    expect(first.seen).toContain("acme__widgets@aaaaaaa@/wt/acme__widgets@aaaaaaa");
    expect(existsSync(join(runDir, "errors", "acme__gadgets@bbbbbbb.json"))).toBe(true);

    const second = countingReviewer();
    expect(await reviewInstances({ runDir, instances: fixtureInstances, reviewer: second, prepare, concurrency: 2 })).toEqual({
      reviewed: 1,
      skipped: 1,
      failed: 1,
    });
    expect(second.seen.map((s) => s.split("@/")[0]).sort()).toEqual(["acme__gadgets@bbbbbbb", "acme__tools@ccccccc"]);
    expect(readResult(runDir, "acme__gadgets@bbbbbbb")?.run.comments).toHaveLength(5);
  });

  it("records a preparation failure as an error, not a crash", async () => {
    const runDir = newRunDir();
    openRunDir(runDir, manifest(), fixtureInstances, false);
    const tally = await reviewInstances({
      runDir,
      instances: fixtureInstances.slice(0, 1),
      reviewer: countingReviewer(),
      prepare: async () => {
        throw new Error("clone failed");
      },
      concurrency: 1,
    });
    expect(tally.failed).toBe(1);
    const err = JSON.parse(readFileSync(join(runDir, "errors", "acme__widgets@aaaaaaa.json"), "utf8"));
    expect(err.run.error).toBe("clone failed");
  });
});

describe("openRunDir", () => {
  it("refuses to reuse a directory without --resume, and refuses a resume with other settings", () => {
    const runDir = newRunDir();
    openRunDir(runDir, manifest(), fixtureInstances, false);
    expect(() => openRunDir(runDir, manifest(), fixtureInstances, false)).toThrow(/--resume/);
    expect(() => openRunDir(runDir, manifest({ depth: "deep" }), fixtureInstances, true)).toThrow(/depth/);
    expect(() => openRunDir(runDir, manifest({ experiments: [] }), fixtureInstances, true)).toThrow(/experiments/);
    expect(() => openRunDir(runDir, manifest({ instanceIds: ["x"] }), fixtureInstances, true)).toThrow(/instanceIds/);
    expect(() => openRunDir(runDir, manifest({ createdAt: "later" }), fixtureInstances, true)).not.toThrow();
  });
});

describe("official shapes", () => {
  it("writes a result evaluate.py's OCR builder reads, with duration rounded as upstream", () => {
    const out = toOfficialResult({ instance: fixtureInstances[1], run: fixtureRuns[1], startedAt: "t" }) as any;
    expect(out.duration_seconds).toBe(7.12);
    expect(out.review.summary).toEqual({ input_tokens: 1000, output_tokens: 51 });
    expect(out.review.comments[1]).toEqual({ path: "x.go", start_line: 8, end_line: 8, content: "Goroutine never exits after cancel." });
  });

  it("writes the standard schema line ReviewInstance.from_dict accepts", () => {
    const line = toOfficialInstance(fixtureInstances[0]) as any;
    expect(Object.keys(line)).toEqual(["instance_id", "repo", "base_commit", "head_commit", "reference_comments"]);
    expect(line.reference_comments[2]).toEqual({ path: "src/a.py", start_line: null, end_line: null, text: "Error from save() is swallowed." });
  });
});

describe("scoreRun", () => {
  it("scores, writes metrics.json and summary.md, and re-scoring costs no judge calls", async () => {
    const runDir = newRunDir();
    openRunDir(runDir, manifest(), fixtureInstances, false);
    await reviewInstances({ runDir, instances: fixtureInstances, reviewer: countingReviewer(), prepare: async () => ({ path: "." }), concurrency: 3 });

    const model = cannedModel();
    const cache = join(runDir, "judge-cache");
    const m1 = await scoreRun(runDir, createCachedJudge(model, { cacheDir: cache, retries: 0 }), "fake");
    const asked = model.asked;
    expect(asked).toBeGreaterThan(0);
    const m2 = await scoreRun(runDir, createCachedJudge(model, { cacheDir: cache, retries: 0 }), "fake");
    // Only the failing call is asked again; it is never cached.
    expect(model.asked - asked).toBe(1);
    expect(m2.summary).toEqual(m1.summary);
    expect(m1.komodo.cost_usd).toBe(1);
    expect(m1.komodo.by_language.Go).toMatchObject({ evaluated_instances: 1, missing_instances: 1 });
    expect(readFileSync(join(runDir, "summary.md"), "utf8")).toContain("| 0.312 | 0.750 | 0.441 | 2 | 1 |");

    const [row] = compareRuns([runDir]);
    expect(row).toMatchObject({ reviewer: "komodo m standard", experiments: "pin", n: 2, precision: 0.312, recall: 0.75, f1: 0.441, avgTokens: 1050, avgSeconds: 9.73, cost: 1 });
  });

  it("compare asks for a score first on an unscored run", () => {
    const runDir = newRunDir();
    openRunDir(runDir, manifest(), fixtureInstances, false);
    expect(() => compareRuns([runDir])).toThrow(/score it first/);
  });
});
