import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { createKomodoReviewer } from "../../src/aacr/reviewers/komodo.js";
import { loadOcrReviewer } from "../../src/aacr/load-reviewer.js";
import type { AacrInstance } from "../../src/aacr/types.js";
import { LocalGitDiffSource, parseNumstatZ } from "../../src/diff-sources/local-git.js";
import { runLocalReview } from "../../src/pipeline.js";
import type { ReviewInput, ReviewProvider } from "../../src/providers/types.js";
import type { Judgement, ReviewResult } from "../../src/schema.js";

// Each case builds a real git repository; under a full parallel run that is
// slower than vitest's default 5 s.
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "Ada", GIT_AUTHOR_EMAIL: "a@x", GIT_COMMITTER_NAME: "Ada", GIT_COMMITTER_EMAIL: "a@x" } }).trim();

/**
 * base: a.ts (20 lines), old.ts, package-lock.json
 * head: a.ts lines 5 and 6 changed, old.ts renamed to new.ts with an edit,
 *       package-lock.json changed (path-filtered)
 * The checkout is left at base, so a test passing only because it read HEAD fails.
 */
function fixtureRepo(): { dir: string; base: string; head: string } {
  const dir = mkdtempSync(join(tmpdir(), "komodo-local-range-"));
  dirs.push(dir);
  git(dir, "init", "-q", "-b", "main");
  const lines = Array.from({ length: 20 }, (_, i) => `export const v${i + 1} = ${i + 1};`);
  writeFileSync(join(dir, "a.ts"), `${lines.join("\n")}\n`);
  mkdirSync(join(dir, "lib"));
  writeFileSync(join(dir, "lib", "old.ts"), Array.from({ length: 30 }, (_, i) => `// line ${i}`).join("\n") + "\n");
  writeFileSync(join(dir, "package-lock.json"), "{}\n");
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "base");
  const base = git(dir, "rev-parse", "HEAD");
  git(dir, "checkout", "-q", "-b", "feature");
  lines[4] = "export const v5 = compute();";
  lines[5] = "export const v6 = v5 * 2;";
  writeFileSync(join(dir, "a.ts"), `${lines.join("\n")}\n`);
  git(dir, "mv", "lib/old.ts", "lib/new.ts");
  writeFileSync(join(dir, "lib", "new.ts"), Array.from({ length: 30 }, (_, i) => (i === 3 ? "// changed" : `// line ${i}`)).join("\n") + "\n");
  writeFileSync(join(dir, "package-lock.json"), '{"v":2}\n');
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "Compute v5");
  const head = git(dir, "rev-parse", "HEAD");
  git(dir, "checkout", "-q", "main");
  return { dir, base, head };
}

const judgement = (path: string, line: number, title: string): Judgement =>
  ({ path, line, severity: "major", kind: "Risk", focus: "code", title, lede: `${title} lede`, detail: `${title} detail` }) as unknown as Judgement;

function fakeProvider(judgements: Judgement[]): ReviewProvider & { inputs: ReviewInput[] } {
  const inputs: ReviewInput[] = [];
  return {
    name: "fake",
    inputs,
    async review(input) {
      inputs.push(input);
      input.onUsage?.({ costUsd: 0.25, inputTokens: 1200, outputTokens: 300 });
      const result: ReviewResult = {
        intent: "i",
        summary: "s",
        walkthrough: [],
        confidence: 3,
        verdict: "v",
        effort: 1,
        verificationChecks: [],
        judgements,
      };
      return result;
    },
  };
}

describe("LocalGitDiffSource with an explicit head", { timeout: 30_000 }, () => {
  it("diffs merge-base(base, head)...head, not HEAD, and keeps renames as real paths", async () => {
    const { dir, base, head } = fixtureRepo();
    const source = new LocalGitDiffSource(dir, base, head);
    const files = await source.getFiles();
    expect(files.map((f) => [f.path, f.status]).sort()).toEqual([
      ["a.ts", "modified"],
      ["lib/new.ts", "renamed"],
      ["package-lock.json", "modified"],
    ]);
    expect(files.find((f) => f.path === "lib/new.ts")?.patch).toContain("+// changed");
    const meta = await source.getMeta();
    expect(meta.headSha).toBe(head);
    expect(meta.title).toBe("Compute v5");
    expect(meta.author).toBe("Ada");
  });

  it("parses -z numstat including renames and binaries", () => {
    expect(parseNumstatZ("3\t1\ta.ts\0-\t-\timg.bin\x001\t1\t\0old.ts\0new.ts\0")).toEqual([
      { additions: 3, deletions: 1, path: "a.ts" },
      { additions: 0, deletions: 0, path: "img.bin" },
      { additions: 1, deletions: 1, path: "new.ts", from: "old.ts" },
    ]);
  });
});

describe("runLocalReview", { timeout: 30_000 }, () => {
  it("runs the real pipeline from the checkout, filters paths and drops unanchorable judgements", async () => {
    const { dir, base, head } = fixtureRepo();
    const provider = fakeProvider([judgement("a.ts", 5, "Kept."), judgement("a.ts", 19, "Off the diff.")]);
    const out = await runLocalReview({
      repoDir: dir,
      base,
      head,
      provider,
      config: (await import("../../src/config.js")).KomodoConfigSchema.parse({}),
      depthRequest: { depth: "standard", by: "eval" },
      experiments: ["pin", "reflect"],
    });
    const input = provider.inputs[0];
    expect(input.repoDir).toBe(dir);
    expect(input.experiments).toEqual(["pin", "reflect"]);
    expect(input.files.map((f) => f.path).sort()).toEqual(["a.ts", "lib/new.ts"]);
    expect(out.result.judgements.map((j) => j.title)).toEqual(["Kept."]);
    expect(out.dropped.map((j) => j.title)).toEqual(["Off the diff."]);
    expect(out.passRun).toMatchObject({ passes: 1, costUsd: 0.25, inputTokens: 1200, outputTokens: 300 });
  });
});

describe("createKomodoReviewer", { timeout: 30_000 }, () => {
  const instance = (base: string, head: string): AacrInstance => ({
    id: "acme__x@abcdef0",
    repo: "acme/x",
    prUrl: "https://github.com/acme/x/pull/1",
    language: "TypeScript",
    baseCommit: base,
    headCommit: head,
    changeLines: 4,
    references: [],
  });

  it("turns each kept judgement into one generated comment and records usage", async () => {
    const { dir, base, head } = fixtureRepo();
    const reviewer = createKomodoReviewer({ provider: fakeProvider([judgement("a.ts", 6, "Doubles v5.")]), experiments: ["grouping"] });
    const run = await reviewer.review(instance(base, head), dir);
    expect(run).toMatchObject({
      instanceId: "acme__x@abcdef0",
      reviewer: "komodo",
      comments: [{ path: "a.ts", fromLine: 6, toLine: 6, body: "Doubles v5.\n\nDoubles v5. lede\n\nDoubles v5. detail" }],
      inputTokens: 1200,
      outputTokens: 300,
      costUsd: 0.25,
    });
    expect(run.error).toBeUndefined();
  });

  it("scores a change with nothing reviewable as an empty review, and a provider failure as an error", async () => {
    const { dir, base } = fixtureRepo();
    git(dir, "checkout", "-q", "-b", "lock-only");
    writeFileSync(join(dir, "package-lock.json"), '{"v":3}\n');
    git(dir, "commit", "-qam", "lock");
    const lockHead = git(dir, "rev-parse", "HEAD");
    const empty = await createKomodoReviewer({ provider: fakeProvider([]) }).review(instance(base, lockHead), dir);
    expect(empty.error).toBeUndefined();
    expect(empty.comments).toEqual([]);

    const { dir: other, base: b2, head: h2 } = fixtureRepo();
    const failing: ReviewProvider = { name: "f", review: async () => { throw new Error("model down"); } };
    const failed = await createKomodoReviewer({ provider: failing }).review(instance(b2, h2), other);
    expect(failed.error).toBe("model down");
    expect(failed.comments).toEqual([]);
  });
});

describe("loadOcrReviewer", { timeout: 30_000 }, () => {
  it("loads ocr.ts when the build has it, and says so clearly when it does not", async () => {
    const loaded = await loadOcrReviewer({ mode: "delegate" }).then(
      (r) => ({ ok: true as const, name: r.name }),
      (e: Error) => ({ ok: false as const, message: e.message }),
    );
    if (loaded.ok) expect(typeof loaded.name).toBe("string");
    else expect(loaded.message).toMatch(/ocr reviewer is not part of this build/);
  });
});
