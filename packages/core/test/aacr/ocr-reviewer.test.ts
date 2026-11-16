import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildDelegatePrompt,
  convertOcrComments,
  createOcrReviewer,
  parseDelegateOutput,
  parseManagedOutput,
} from "../../src/aacr/reviewers/ocr.js";
import type { AacrInstance } from "../../src/aacr/types.js";

const fixture = (name: string) =>
  readFile(new URL(`../fixtures/ocr/${name}`, import.meta.url), "utf8");

const instance: AacrInstance = {
  id: "playground-1",
  repo: "Delavalom/komodo-playground",
  prUrl: "https://github.com/Delavalom/komodo-playground/pull/1",
  language: "javascript",
  baseCommit: "4eb605c78ecfbf1157deabe4bb597bcc62dc264f",
  headCommit: "f17a739bc7c0ca5dfc1b489513fd71b7cc9308fe",
  changeLines: 32,
  references: [],
};

describe("convertOcrComments", () => {
  it("keeps the text and the range, as AACR's own adapter does", () => {
    expect(
      convertOcrComments([
        { path: "a.js", content: "  bad  ", start_line: 3, end_line: 5, suggestion_code: "x" },
      ]),
    ).toEqual([{ path: "a.js", fromLine: 3, toLine: 5, body: "bad" }]);
  });

  it("fills a missing end of the range from the other and orders a reversed one", () => {
    const out = convertOcrComments([
      { path: "a.js", content: "x", start_line: 4 },
      { path: "a.js", content: "y", end_line: 9 },
      { path: "a.js", content: "z", start_line: 8, end_line: 2 },
      { path: "a.js", content: "w" },
    ]);
    expect(out.map((c) => [c.fromLine, c.toLine])).toEqual([
      [4, 4],
      [9, 9],
      [2, 8],
      [undefined, undefined],
    ]);
  });

  it("drops empty bodies, junk entries and a non-array", () => {
    expect(convertOcrComments([{ path: "a", content: "   " }, null, "x", { path: "a" }])).toEqual([]);
    expect(convertOcrComments(undefined)).toEqual([]);
    expect(convertOcrComments({ comments: [] })).toEqual([]);
  });

  it("ignores line numbers that are not positive integers", () => {
    expect(
      convertOcrComments([{ path: "a", content: "x", start_line: 0, end_line: "7" }]),
    ).toEqual([{ path: "a", body: "x" }]);
  });
});

describe("parseManagedOutput (captured ocr review --format json)", () => {
  it("turns the real run into comments and tokens", async () => {
    const run = parseManagedOutput(await fixture("managed-review.json"));
    expect(run.comments).toHaveLength(6);
    expect(run.comments[0]).toMatchObject({
      path: "src/db.js",
      fromLine: 17,
      toLine: 17,
      body: expect.stringContaining("SQL injection"),
    });
    expect(run.comments.every((c) => !c.body.includes("suggestion_code"))).toBe(true);
    expect(run.inputTokens).toBe(33027);
    expect(run.outputTokens).toBe(1796);
    expect(run.costUsd).toBeNull();
  });

  it("fails a run that ended without comments", () => {
    expect(() => parseManagedOutput(JSON.stringify({ status: "failed", message: "boom" }))).toThrow(
      /failed: boom/,
    );
  });

  it("accepts a completed run with no findings", () => {
    const run = parseManagedOutput(JSON.stringify({ status: "complete", comments: [] }));
    expect(run.comments).toEqual([]);
  });
});

describe("parseDelegateOutput (captured claude -p --output-format json)", () => {
  it("reads structured_output, the cost, and counts cache reads as input", async () => {
    const run = parseDelegateOutput(await fixture("delegate-claude.json"));
    expect(run.comments).toHaveLength(6);
    expect(run.comments.map((c) => c.path)).toContain("src/wallet.js");
    expect(run.comments[0]).toMatchObject({ path: "src/db.js", fromLine: 15, toLine: 19 });
    expect(run.inputTokens).toBe(10 + 38963 + 144133);
    expect(run.outputTokens).toBe(1844);
    expect(run.costUsd).toBeCloseTo(0.1888726, 6);
  });

  it("falls back to JSON in the text when there is no structured output", () => {
    const run = parseDelegateOutput(
      JSON.stringify({
        subtype: "success",
        result: 'Here you go:\n```json\n{"comments":[{"path":"a.js","content":"x","start_line":2}]}\n```',
      }),
    );
    expect(run.comments).toEqual([{ path: "a.js", fromLine: 2, toLine: 2, body: "x" }]);
    expect(run.costUsd).toBeNull();
  });

  it("throws when the run errored or produced nothing parseable", () => {
    expect(() =>
      parseDelegateOutput(JSON.stringify({ is_error: true, subtype: "error_max_turns" })),
    ).toThrow(/error_max_turns/);
    expect(() => parseDelegateOutput(JSON.stringify({ subtype: "success", result: "no json" }))).toThrow(
      /no structured comments/,
    );
  });
});

describe("buildDelegatePrompt", () => {
  it("names the range and nothing about what to find", () => {
    const p = buildDelegatePrompt("aaa", "bbb");
    expect(p).toContain("--from aaa --to bbb");
    expect(p).toContain("open-code-review-delegate");
  });
});

describe("createOcrReviewer end to end with stand-in binaries", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ocr-reviewer-test-"));
  });
  afterEach(async () => {
    delete process.env.OPENROUTER_API_KEY;
    await rm(dir, { recursive: true, force: true });
  });

  async function script(name: string, body: string): Promise<string> {
    const path = join(dir, name);
    await writeFile(path, `#!/bin/sh\n${body}\n`);
    await chmod(path, 0o755);
    return path;
  }

  it("delegate: loads the OCR plugin for this run only, asks for the range, returns comments", async () => {
    const out = await fixture("delegate-claude.json");
    await writeFile(join(dir, "out.json"), out);
    const claude = await script(
      "claude",
      `printf '%s\\n' "$@" > "${dir}/argv.txt"
pd=""; prev=""
for a in "$@"; do [ "$prev" = "--plugin-dir" ] && pd="$a"; prev="$a"; done
ls "$pd/skills/open-code-review-delegate" > "${dir}/plugin-ls.txt"
echo "$pd" > "${dir}/plugin-dir.txt"
cat "${dir}/out.json"`,
    );
    const reviewer = createOcrReviewer({ claudeCommand: claude });
    expect(reviewer.name).toBe("ocr");
    const run = await reviewer.review(instance, dir);
    expect(run.error).toBeUndefined();
    expect(run.comments).toHaveLength(6);
    expect(run.reviewer).toBe("ocr");
    expect(run.instanceId).toBe("playground-1");
    expect(run.costUsd).toBeGreaterThan(0);

    const argv = (await readFile(join(dir, "argv.txt"), "utf8")).split("\n");
    expect(argv[argv.indexOf("--model") + 1]).toBe("claude-sonnet-5-5");
    expect(argv).toContain("--strict-mcp-config");
    expect(argv[argv.indexOf("--setting-sources") + 1]).toBe("project");
    expect(argv.join(" ")).toContain(instance.baseCommit);
    expect(await readFile(join(dir, "plugin-ls.txt"), "utf8")).toContain("SKILL.md");
    // The plugin directory is throwaway.
    const pluginDir = (await readFile(join(dir, "plugin-dir.txt"), "utf8")).trim();
    await expect(readFile(join(pluginDir, ".claude-plugin", "plugin.json"))).rejects.toThrow();
  });

  it("managed: gives ocr the range and an OpenRouter endpoint, and never echoes the key", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test-secret-123";
    await writeFile(join(dir, "out.json"), await fixture("managed-review.json"));
    const ocr = await script(
      "ocr",
      `printf '%s\\n' "$@" > "${dir}/argv.txt"
printf 'url=%s model=%s protocol=%s home=%s\\n' "$OCR_LLM_URL" "$OCR_LLM_MODEL" "$OCR_LLM_PROTOCOL" "$HOME" > "${dir}/env.txt"
cat "${dir}/out.json"`,
    );
    const reviewer = createOcrReviewer({ mode: "managed", ocrCommand: ocr });
    expect(reviewer.name).toBe("ocr-managed");
    const run = await reviewer.review(instance, dir);
    expect(run.error).toBeUndefined();
    expect(run.comments).toHaveLength(6);
    expect(run.inputTokens).toBe(33027);

    const argv = (await readFile(join(dir, "argv.txt"), "utf8")).split("\n");
    expect(argv.slice(0, 7)).toEqual(["review", "--repo", dir, "--from", instance.baseCommit, "--to", instance.headCommit]);
    expect(argv[argv.indexOf("--max-tools") + 1]).toBe("50");
    const env = await readFile(join(dir, "env.txt"), "utf8");
    expect(env).toContain("url=https://openrouter.ai/api/v1");
    expect(env).toContain("model=anthropic/claude-sonnet-5.5");
    expect(env).toContain("protocol=openai");
    expect(env).not.toContain(process.env.HOME ?? "\0");
    expect(JSON.stringify(run)).not.toContain("sk-or-test-secret-123");
  });

  it("returns the failure on the run instead of throwing, with the key redacted", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test-secret-123";
    const ocr = await script("ocr", `echo "auth failed for $OCR_LLM_TOKEN" >&2; exit 3`);
    const run = await createOcrReviewer({ mode: "managed", ocrCommand: ocr }).review(instance, dir);
    expect(run.comments).toEqual([]);
    expect(run.error).toMatch(/exited 3/);
    expect(run.error).not.toContain("sk-or-test-secret-123");
  });

  it("managed mode without any key is a clear error on the run", async () => {
    const run = await createOcrReviewer({
      mode: "managed",
      ocrCommand: "ocr",
      keyFile: join(dir, "missing.key"),
    }).review(instance, dir);
    expect(run.error).toMatch(/OPENROUTER_API_KEY/);
  });
});
