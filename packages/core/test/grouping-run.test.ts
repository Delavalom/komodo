import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { KomodoConfigSchema } from "../src/config.js";
import type { GitHubClient, PRFile } from "../src/github.js";
import { bundleFiles, combineBundleResults, runGroupedPasses } from "../src/grouping.js";
import type { PassInput } from "../src/passes.js";
import { runReview } from "../src/pipeline.js";
import { buildReviewPrompt } from "../src/providers/prompt.js";
import type { ReviewInput, ReviewProvider } from "../src/providers/types.js";
import { ReviewRecordSchema, type Judgement, type ReviewResult } from "../src/schema.js";

const judgement = (over: Partial<Judgement>): Judgement => ({
  path: "src/a.ts", line: 1, severity: "major", kind: "Risk", focus: "code", tag: "t",
  title: "A thing is true.", lede: "l", detail: "d", ask: "Is it?", sources: ["the diff"],
  sourceNote: "s", code: "src/a.ts:1 x",
  options: [
    { label: "a", bucket: "Blocks" },
    { label: "b", bucket: "Agreed" },
    { label: "I have a question first", bucket: "Asked" },
    { label: "Not my call", bucket: "Passed on" },
  ],
  fixPrompt: "f",
  ...over,
});

const result = (over: Partial<ReviewResult> = {}): ReviewResult => ({
  intent: "i", summary: "- s", walkthrough: [], confidence: 4, verdict: "v", effort: 2,
  verificationChecks: [], judgements: [], ...over,
});

/** A patch whose added lines are 1..n, so a judgement on line 1 is commentable. */
const patch = (n = 3) => `@@ -0,0 +1,${n} @@\n${Array.from({ length: n }, (_, i) => `+line ${i + 1}`).join("\n")}`;

const prFile = (path: string, over: Partial<PRFile> = {}): PRFile => ({
  path, status: "modified", additions: 5, deletions: 1, patch: patch(), ...over,
});

const pr = {
  owner: "acme", repo: "api", number: 1, title: "t", body: "the description", author: "dev",
  url: "u", baseRef: "main", headRef: "h", headSha: "abc", isDraft: false, labels: [] as string[],
};

/** Reviews a bundle by raising one judgement per file it was shown. */
function perFile(options: {
  cost?: number;
  failOn?: (input: ReviewInput) => boolean;
  delayMs?: number;
} = {}) {
  const seen: ReviewInput[] = [];
  let active = 0;
  let peak = 0;
  const provider: ReviewProvider = {
    name: "fake",
    async review(input) {
      seen.push(input);
      active++;
      peak = Math.max(peak, active);
      try {
        await new Promise((r) => setTimeout(r, options.delayMs ?? 0));
        if (options.cost !== undefined) input.onUsage?.({ costUsd: options.cost });
        if (options.failOn?.(input)) throw new Error("boom");
        const base = !input.pass || input.pass.kind === "base";
        return result({
          summary: `- ${input.files.map((f) => f.path).join(", ")}`,
          walkthrough: base ? [{ files: input.files.map((f) => f.path), summary: "w", kind: "behavioural" }] : [],
          judgements: base
            ? input.files.map((f) => judgement({ path: f.path, title: `About ${f.path}.` }))
            : [],
        });
      } finally {
        active--;
      }
    },
  };
  return { provider, seen, peak: () => peak };
}

const manyFiles = (n: number) => Array.from({ length: n }, (_, i) => prFile(`dir${String(i).padStart(2, "0")}/f.ts`));

const baseInput = (files: PRFile[]): PassInput => ({ pr, files, config: KomodoConfigSchema.parse({}) });

describe("runGroupedPasses", () => {
  it("reviews each bundle on its own files and merges the judgements", async () => {
    const files = manyFiles(6);
    const bundles = bundleFiles(files, { maxFilesPerBundle: 2 });
    const { provider, seen } = perFile({ cost: 0.5 });
    const run = await runGroupedPasses({ provider, input: baseInput(files), depth: "standard", bundles });

    expect(bundles).toHaveLength(3);
    expect(seen).toHaveLength(3);
    for (const s of seen) {
      expect(s.files.length).toBe(2);
      expect(s.bundle?.total).toBe(3);
      // Everything else in the pull request is named, none of it as a diff.
      expect(s.bundle?.otherFiles).toHaveLength(4);
      expect(s.bundle?.otherFiles.some((o) => s.files.some((f) => f.path === o.path))).toBe(false);
    }
    expect(run.result.judgements.map((j) => j.path).sort()).toEqual(files.map((f) => f.path).sort());
    expect(run.costUsd).toBeCloseTo(1.5);
    expect(run.bundles).toBe(3);
    expect(run.failed).toEqual([]);
  });

  it("assembles the prose that describes the whole change", async () => {
    const files = manyFiles(4);
    const bundles = bundleFiles(files, { maxFilesPerBundle: 2 });
    const { provider } = perFile();
    const { result: merged } = await runGroupedPasses({ provider, input: baseInput(files), depth: "standard", bundles });
    expect(merged.walkthrough.flatMap((w) => w.files).sort()).toEqual(files.map((f) => f.path).sort());
    expect(merged.summary.split("\n")).toHaveLength(2);
    expect(merged.diagram).toBeUndefined();
    expect(merged.verdict).toContain("Reviewed as 2 separate file bundles.");
  });

  it("runs the full depth inside every bundle", async () => {
    const files = manyFiles(4);
    const bundles = bundleFiles(files, { maxFilesPerBundle: 2 });
    const { provider, seen } = perFile({ cost: 1 });
    const run = await runGroupedPasses({ provider, input: baseInput(files), depth: "thorough", bundles });
    expect(seen).toHaveLength(10);
    expect(seen.filter((s) => s.pass?.kind === "second-look")).toHaveLength(2);
    expect(run.costUsd).toBe(10);
    // 10 sub-passes, but a record cannot claim more than thorough ever runs.
    expect(run.passes).toBe(5);
  });

  it("never has more bundles in flight than the concurrency limit", async () => {
    const files = manyFiles(14);
    const bundles = bundleFiles(files, { maxFilesPerBundle: 1 });
    expect(bundles).toHaveLength(14);

    const limited = perFile({ delayMs: 5 });
    await runGroupedPasses({ provider: limited.provider, input: baseInput(files), depth: "standard", bundles });
    expect(limited.peak()).toBe(3);

    const wide = perFile({ delayMs: 5 });
    await runGroupedPasses({ provider: wide.provider, input: baseInput(files), depth: "standard", bundles, concurrency: 1 });
    expect(wide.peak()).toBe(1);
  });

  it("reports a failed bundle and carries on without it", async () => {
    const files = manyFiles(6);
    const bundles = bundleFiles(files, { maxFilesPerBundle: 2 });
    const doomed = bundles[1].files.map((f) => f.path);
    const { provider } = perFile({ failOn: (i) => i.files.some((f) => doomed.includes(f.path)) });
    const lines: string[] = [];
    const run = await runGroupedPasses({
      provider, input: baseInput(files), depth: "standard", bundles, onProgress: (m) => lines.push(m),
    });

    expect(run.failed).toEqual([{ label: bundles[1].label, paths: doomed, error: "boom" }]);
    expect(lines.some((l) => l.includes("[bundle 2/3]") && l.includes("failed; continuing"))).toBe(true);
    expect(run.result.judgements.map((j) => j.path).sort()).toEqual(
      files.map((f) => f.path).filter((p) => !doomed.includes(p)).sort(),
    );
    expect(run.result.verdict).toContain("2 file(s) in 1 failed bundle(s) were not reviewed.");
    expect(run.result.confidence).toBeLessThanOrEqual(2);
  });

  it("fails when every bundle fails, like a failed base pass", async () => {
    const files = manyFiles(4);
    const bundles = bundleFiles(files, { maxFilesPerBundle: 2 });
    const { provider } = perFile({ failOn: () => true });
    await expect(
      runGroupedPasses({ provider, input: baseInput(files), depth: "standard", bundles }),
    ).rejects.toThrow(/Every file bundle failed.*boom/);
  });

  it("drops a judgement about a file another bundle owns, and keeps a cross-cutting one", async () => {
    const files = manyFiles(4);
    const bundles = bundleFiles(files, { maxFilesPerBundle: 2 });
    const stray = bundles[1].files[0].path;
    const provider: ReviewProvider = {
      name: "fake",
      async review(input) {
        return result({
          judgements: [
            judgement({ path: input.files[0].path, title: "Own." }),
            judgement({ path: stray, title: "Stray." }),
            judgement({ path: "", line: 0, title: `Across ${input.bundle?.index}.` }),
          ],
        });
      },
    };
    const run = await runGroupedPasses({ provider, input: baseInput(files), depth: "standard", bundles });
    const titles = run.result.judgements.map((j) => j.title);
    // The stray one survives only from the bundle that owns its file.
    expect(titles.filter((t) => t === "Stray.")).toHaveLength(1);
    expect(titles).toContain("Across 1.");
    expect(titles).toContain("Across 2.");
  });

  it("says in the prompt what the bundle covers, and nothing extra otherwise", () => {
    const files = manyFiles(2);
    const plain = buildReviewPrompt({ pr, files, config: KomodoConfigSchema.parse({}) });
    expect(plain).not.toContain("## This bundle");
    const bundled = buildReviewPrompt({
      pr, files: [files[0]], config: KomodoConfigSchema.parse({}),
      bundle: { index: 1, total: 2, otherFiles: [{ path: files[1].path, status: "modified", additions: 5, deletions: 1 }] },
    });
    expect(bundled).toContain("bundle 1 of 2");
    expect(bundled).toContain(`- ${files[1].path} (modified, +5/-1)`);
    expect(bundled).toContain(`### ${files[0].path}`);
    expect(bundled).not.toContain(`### ${files[1].path}`);
  });
});

describe("combineBundleResults", () => {
  it("is the ordinary merge for a single result", () => {
    const one = result({ judgements: [judgement({})] });
    expect(combineBundleResults([one])).toEqual(one);
  });

  it("takes the weakest confidence and the heaviest effort", () => {
    const merged = combineBundleResults([result({ confidence: 5, effort: 1 }), result({ confidence: 3, effort: 4 })]);
    expect([merged.confidence, merged.effort]).toEqual([3, 4]);
  });

  it("keeps the more severe reading of a concern two bundles both raised", () => {
    const minor = judgement({ path: "", line: 0, severity: "minor", title: "Same." });
    const major = judgement({ path: "", line: 0, severity: "major", title: "Same." });
    const merged = combineBundleResults([result({ judgements: [minor] }), result({ judgements: [major] })]);
    expect(merged.judgements.map((j) => j.severity)).toEqual(["major"]);
  });
});

// ── through runReview ──────────────────────────────────────────────────────

const dirs: string[] = [];
const outDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "komodo-grouping-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

const githubWith = (files: PRFile[]) =>
  ({
    async getPR(r: { owner: string; repo: string; number: number }) {
      return { ...r, ...pr };
    },
    async listFiles() {
      return files;
    },
  }) as unknown as GitHubClient;

const ref = { owner: "acme", repo: "api", number: 1 };
const config = KomodoConfigSchema.parse({});

describe("runReview — experiments: grouping", () => {
  it("is off unless asked for: one review of every file, no bundle", async () => {
    const files = manyFiles(12);
    const { provider, seen } = perFile();
    const outcome = await runReview({ ref, provider, config, github: githubWith(files), post: false, outDir: outDir() });
    expect(seen).toHaveLength(1);
    expect(seen[0].files).toHaveLength(12);
    expect(seen[0].bundle).toBeUndefined();
    expect(outcome.record.run?.passes).toBe(1);
  });

  it("ignores experiments it does not know", async () => {
    const { provider, seen } = perFile();
    await runReview({
      ref, provider, config, github: githubWith(manyFiles(12)), post: false, outDir: outDir(), experiments: ["other"],
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].bundle).toBeUndefined();
  });

  it("bundles a large change, sums the cost and still writes a valid record", async () => {
    const files = manyFiles(25);
    const { provider, seen } = perFile({ cost: 0.25 });
    const lines: string[] = [];
    const outcome = await runReview({
      ref, provider, config, github: githubWith(files), post: false, outDir: outDir(),
      experiments: ["grouping"], onProgress: (m) => lines.push(m),
    });
    // 25 unrelated files at 10 per bundle: 10 + 10 + 5.
    expect(seen.map((s) => s.files.length).sort()).toEqual([10, 10, 5]);
    expect(lines.some((l) => l.startsWith("  grouping: 3 bundles"))).toBe(true);
    expect(outcome.record.run).toMatchObject({ depth: "standard", costUsd: 0.75 });
    expect(outcome.record.files).toHaveLength(25);
    expect(outcome.record.result.judgements).toHaveLength(25);
    expect(ReviewRecordSchema.parse(outcome.record).run?.passes).toBeLessThanOrEqual(1);
  });

  it("keeps a small change set as the ordinary single review", async () => {
    const { provider, seen } = perFile();
    const lines: string[] = [];
    await runReview({
      ref, provider, config, github: githubWith(manyFiles(3)), post: false, outDir: outDir(),
      experiments: ["grouping"], onProgress: (m) => lines.push(m),
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].bundle).toBeUndefined();
    expect(lines).toContain("  grouping: one bundle, reviewing as a single unit.");
  });

  it("respects depth inside each bundle", async () => {
    const { provider, seen } = perFile();
    const outcome = await runReview({
      ref, provider, config, github: githubWith(manyFiles(12)), post: false, outDir: outDir(),
      experiments: ["grouping"], depthRequest: { depth: "deep", by: "test" },
    });
    // 12 files -> 10 + 2 -> two bundles, each a base pass and a second look.
    expect(seen).toHaveLength(4);
    expect(outcome.record.run).toMatchObject({ depth: "deep", passes: 2 });
  });
});
