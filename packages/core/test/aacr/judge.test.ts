import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { buildJudgePrompt, createCachedJudge, createLimiter, parseJudgeAnswer, type JudgeModel } from "../../src/aacr/judge.js";

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

/**
 * Each answer and what `match_llm_file_level` returns for it with three
 * references, printed by CPython running the upstream parsing lines verbatim.
 */
const pythonParses: [string, number[]][] = [
  ["[1, 3]", [1, 3]],
  ["1. Match\n2. No\n\n[1,2]", [1, 2]],
  ["no brackets here", []],
  ["[]", []],
  ["[ ]", []],
  ["first [1] then [2]", [2]],
  ["[1,,2]", []],
  ["[9]", []],
  ["[0, 1, 4]", [1]],
  ["[1, 1]", [1, 1]],
  ["[01]", []],
  ["[1 2]", []],
  ["trailing [2]\n", [2]],
  ["[١]", []],
  ["Answer: [3, 2, 1]", [3, 2, 1]],
  ["[x] then [2]", [2]],
  ["[2] then [x]", [2]],
  ["[1,\n 2]", [1, 2]],
  ["[,]", []],
  ["[12345678901234567890]", []],
];

describe("parseJudgeAnswer", () => {
  it.each(pythonParses)("parses %j as upstream does", (text, want) => {
    expect(parseJudgeAnswer(text, 3)).toEqual(want);
  });
});

describe("buildJudgePrompt", () => {
  it("numbers references with their line strings and names the file", () => {
    const prompt = buildJudgePrompt({
      path: "src/a.py",
      genNote: "g",
      genLines: "4-5",
      refNotes: ["first", "second"],
      refLines: ["1-2", "?"],
    });
    expect(prompt.startsWith("\n-Role-\n\nYou are an expert code reviewer")).toBe(true);
    expect(prompt).toContain("(all from the same file: src/a.py)");
    expect(prompt).toContain("-Generated Comment-\n[L4-5] g\n\n-Reference Comments-\n1. [L1-2] first\n2. [L?] second\n\n-Output-");
    expect(prompt.endsWith("[1, 3]\n\nYour answer:\n")).toBe(true);
  });
});

describe("createCachedJudge", () => {
  const call = { path: "a", genNote: "g", genLines: "?", refNotes: ["r1", "r2"], refLines: ["?", "?"] };

  it("asks once per prompt and answers re-scores from the cache", async () => {
    const dir = mkdtempSync(join(tmpdir(), "komodo-judge-"));
    dirs.push(dir);
    let asked = 0;
    const model: JudgeModel = { name: "m", complete: async () => (asked++, { text: "[2]", inputTokens: 10, outputTokens: 2 }) };
    const first = createCachedJudge(model, { cacheDir: dir });
    expect(await first.judge(call)).toEqual({ matched: [2], reason: "[2]" });
    const second = createCachedJudge(model, { cacheDir: dir });
    expect(await second.judge(call)).toEqual({ matched: [2], reason: "[2]" });
    expect(asked).toBe(1);
    expect(first.stats).toMatchObject({ calls: 1, cached: 0, inputTokens: 10, outputTokens: 2 });
    expect(second.stats).toMatchObject({ calls: 0, cached: 1 });
  });

  it("keys the cache by model, so another judge model asks again", async () => {
    const dir = mkdtempSync(join(tmpdir(), "komodo-judge-"));
    dirs.push(dir);
    await createCachedJudge({ name: "a", complete: async () => ({ text: "[1]" }) }, { cacheDir: dir }).judge(call);
    const b = createCachedJudge({ name: "b", complete: async () => ({ text: "[2]" }) }, { cacheDir: dir });
    expect((await b.judge(call)).matched).toEqual([2]);
    expect(readdirSync(dir)).toHaveLength(2);
  });

  it("retries a failure, then scores it as no match without caching it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "komodo-judge-"));
    dirs.push(dir);
    let tries = 0;
    const flaky: JudgeModel = {
      name: "m",
      complete: async () => {
        tries++;
        throw new Error("overloaded");
      },
    };
    const j = createCachedJudge(flaky, { cacheDir: dir, retries: 2 });
    const verdict = await j.judge(call);
    expect(verdict).toMatchObject({ matched: [], error: true });
    expect(verdict.reason).toContain("overloaded");
    expect(tries).toBe(3);
    expect(j.stats.errors).toBe(1);
    expect(readdirSync(dir)).toHaveLength(0);
  });

  it("records an unreadable bracket the way upstream does, as an error reason with no match", async () => {
    const j = createCachedJudge({ name: "m", complete: async () => ({ text: "[1,,2]" }) });
    const verdict = await j.judge(call);
    expect(verdict.matched).toEqual([]);
    expect(verdict.reason).toMatch(/^judge error: unreadable answer \[1,,2\]/);
    expect(verdict.error).toBeUndefined();
  });
});

describe("createLimiter", () => {
  it("never runs more than n tasks at once", async () => {
    const limit = createLimiter(3);
    let active = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        limit(async () => {
          active++;
          peak = Math.max(peak, active);
          await new Promise((r) => setTimeout(r, (i % 4) * 2));
          active--;
        }),
      ),
    );
    expect(peak).toBe(3);
  });
});
