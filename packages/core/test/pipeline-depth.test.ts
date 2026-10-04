import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { KomodoConfigSchema } from "../src/config.js";
import type { GitHubClient } from "../src/github.js";
import { runReview } from "../src/pipeline.js";
import type { ReviewInput, ReviewProvider } from "../src/providers/types.js";
import { ReviewRecordSchema, type ReviewResult } from "../src/schema.js";

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
});
