import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { KomodoConfigSchema } from "../src/config.js";
import type { GitHubClient } from "../src/github.js";
import { runReview } from "../src/pipeline.js";
import type { ReviewInput, ReviewProvider } from "../src/providers/types.js";
import { ReviewRecordSchema, type Judgement, type ReviewResult } from "../src/schema.js";

const result: ReviewResult = {
  summary: "- Adds a limiter",
  walkthrough: [],
  confidence: 3,
  verdict: "Read the limiter.",
  effort: 1,
  verificationChecks: [],
  judgements: [],
};

const github = {
  async getPR(ref: { owner: string; repo: string; number: number }) {
    return {
      ...ref, title: "Limits", body: "", author: "dev", url: "u",
      baseRef: "main", headRef: "limits", headSha: "abc123", isDraft: false,
      labels: ["needs-deep-review"],
    };
  },
  async listFiles() {
    return [
      { path: "src/a.ts", status: "modified", additions: 5, deletions: 1 },
      { path: "src/b.ts", status: "modified", additions: 5, deletions: 1 },
    ];
  },
} as unknown as GitHubClient;

const dirs: string[] = [];
const outDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "komodo-depth-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function counting() {
  const passes: ReviewInput[] = [];
  const provider: ReviewProvider = {
    name: "fake",
    async review(input) {
      passes.push(input);
      return result;
    },
  };
  return { provider, passes };
}

const ref = { owner: "acme", repo: "api", number: 1 };

/** A GitHub stub whose pull request touches exactly these files. */
function githubWithFiles(
  files: { path: string; patch?: string }[],
  labels: string[] = [],
): GitHubClient {
  return {
    async getPR(r: { owner: string; repo: string; number: number }) {
      return {
        ...r, title: "Limits", body: "", author: "dev", url: "u",
        baseRef: "main", headRef: "limits", headSha: "abc123", isDraft: false, labels,
      };
    },
    async listFiles() {
      return files.map((f) => ({ status: "modified", additions: 5, deletions: 1, ...f }));
    },
  } as unknown as GitHubClient;
}

const baseRecord = {
  version: 3, id: "x", createdAt: "2026-01-01T00:00:00Z", provider: "claude",
  pr: { owner: "a", repo: "b", number: 1, title: "t", author: "d", url: "u", baseRef: "m", headRef: "h", headSha: "s" },
  files: [], result, posted: false,
};

describe("runReview — depth", () => {
  it("runs a single standard pass when nothing asks for more", async () => {
    const { provider, passes } = counting();
    const outcome = await runReview({
      ref, provider, github, config: KomodoConfigSchema.parse({}), post: false, outDir: outDir(),
    });
    expect(passes).toHaveLength(1);
    expect(outcome.record.run).toEqual({
      depth: "standard", depthReason: "deployment default", passes: 1, costUsd: null,
    });
  });

  it("lets a rule raise the depth", async () => {
    const { provider, passes } = counting();
    const outcome = await runReview({
      ref, provider, github, post: false, outDir: outDir(),
      config: KomodoConfigSchema.parse({ depth: { rules: [{ label: "needs-deep-review", depth: "deep" }] } }),
    });
    expect(passes).toHaveLength(2);
    expect(outcome.record.run?.depthReason).toBe("labelled needs-deep-review");
  });

  it("lets a request override the rules, and records who asked", async () => {
    const { provider, passes } = counting();
    const outcome = await runReview({
      ref, provider, github, post: false, outDir: outDir(),
      config: KomodoConfigSchema.parse({}),
      depthRequest: { depth: "thorough", by: "renata" },
    });
    expect(passes).toHaveLength(5);
    expect(outcome.record.run).toMatchObject({
      depth: "thorough", depthReason: "requested by renata", passes: 5,
    });
    // The record still validates, so `komodo push` can carry it.
    expect(ReviewRecordSchema.parse(outcome.record).run?.depth).toBe("thorough");
  });

  it("still parses a record written before depth existed", () => {
    const parsed = ReviewRecordSchema.parse({
      version: 3, id: "x", createdAt: "2026-01-01T00:00:00Z", provider: "claude",
      pr: { owner: "a", repo: "b", number: 1, title: "t", author: "d", url: "u", baseRef: "m", headRef: "h", headSha: "s" },
      files: [], result, posted: false,
    });
    expect(parsed.run).toBeUndefined();
    expect(parsed.id).toBe("x");
  });

  it("logs the depth it chose and why", async () => {
    const { provider } = counting();
    const lines: string[] = [];
    await runReview({
      ref, provider, github, post: false, outDir: outDir(),
      config: KomodoConfigSchema.parse({ depth: { rules: [{ label: "needs-deep-review", depth: "deep" }] } }),
      onProgress: (m) => lines.push(m),
    });
    expect(lines).toContain("  depth: deep — labelled needs-deep-review.");
  });

  it("decides on the files that survive path filters", async () => {
    const { provider, passes } = counting();
    const outcome = await runReview({
      ref, provider, post: false, outDir: outDir(),
      github: githubWithFiles([{ path: "src/a.ts" }, { path: "pnpm-lock.yaml" }]),
      config: KomodoConfigSchema.parse({ depth: { rules: [{ files: 2, depth: "deep" }] } }),
    });
    // The lockfile is filtered out, so one reviewable file does not meet "2 files".
    expect(passes).toHaveLength(1);
    expect(outcome.record.run?.depthReason).toBe("deployment default");
  });

  it("keeps a valid judgement when a more severe duplicate would be dropped", async () => {
    const judgement = (over: Partial<Judgement>): Judgement => ({
      path: "src/a.ts", line: 10, severity: "major", kind: "Risk", focus: "architecture",
      tag: "t", title: "Limiter lives in the handler.", lede: "l", detail: "d", ask: "a",
      sources: ["the diff"], sourceNote: "n", code: "c",
      options: [
        { label: "Yes", bucket: "Blocks" },
        { label: "No", bucket: "Agreed" },
        { label: "Question", bucket: "Asked" },
        { label: "Not mine", bucket: "Passed on" },
      ],
      fixPrompt: "f", ...over,
    });
    // Lines 10-14 are added, so they are commentable; line 40 is not in the diff.
    const patch = "@@ -0,0 +10,5 @@\n+a\n+b\n+c\n+d\n+e";
    const provider: ReviewProvider = {
      name: "fake",
      async review(input) {
        if (input.pass?.kind === "lens" && input.pass.focus === "architecture") {
          return { ...result, judgements: [judgement({ severity: "critical", line: 12, endLine: 40 })] };
        }
        if (input.pass?.kind === "base") {
          return { ...result, judgements: [judgement({ severity: "major", line: 10 })] };
        }
        return result;
      },
    };
    const outcome = await runReview({
      ref, provider, post: false, outDir: outDir(),
      github: githubWithFiles([{ path: "src/a.ts", patch }]),
      config: KomodoConfigSchema.parse({}),
      depthRequest: { depth: "thorough" },
    });
    const kept = outcome.record.result.judgements;
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ severity: "major", line: 10 });
  });
});

describe("ReviewRecordSchema — run", () => {
  const run = (over: object) => ({ ...baseRecord, run: { depth: "standard", depthReason: "r", passes: 1, costUsd: null, ...over } });

  it("refuses more passes than the depth runs", () => {
    expect(() => ReviewRecordSchema.parse(run({ passes: 2 }))).toThrow(/More passes/);
    expect(() => ReviewRecordSchema.parse(run({ depth: "deep", passes: 3 }))).toThrow(/More passes/);
  });

  it("accepts a full thorough run and a run that lost a pass", () => {
    expect(ReviewRecordSchema.parse(run({ depth: "thorough", passes: 5 })).run?.passes).toBe(5);
    expect(ReviewRecordSchema.parse(run({ depth: "thorough", passes: 3 })).run?.passes).toBe(3);
  });

  it("refuses an unreasonably long depth reason", () => {
    expect(() => ReviewRecordSchema.parse(run({ depthReason: "x".repeat(201) }))).toThrow();
  });
});
