import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { KomodoConfigSchema } from "../src/config.js";
import type { GitHubClient } from "../src/github.js";
import { pinEnabled, pinPromptField } from "../src/pin.js";
import { runReview } from "../src/pipeline.js";
import { buildReviewPrompt } from "../src/providers/prompt.js";
import type { ReviewInput, ReviewProvider } from "../src/providers/types.js";
import {
  JudgementSchema,
  parseReviewResult,
  reviewResultJsonSchema,
  type ReviewResult,
} from "../src/schema.js";
import { judgement, PATCH } from "./pin-fixtures.js";

describe("pinEnabled", () => {
  it("is on only when the list names pin", () => {
    expect(pinEnabled(undefined)).toBe(false);
    expect(pinEnabled([])).toBe(false);
    expect(pinEnabled(["other"])).toBe(false);
    expect(pinEnabled(["other", "pin"])).toBe(true);
  });
});

describe("schema", () => {
  it("parses a judgement written before anchors existed", () => {
    const { anchor: _a, ...older } = judgement({ anchor: "x" });
    const parsed = JudgementSchema.parse(older);
    expect(parsed.anchor).toBeUndefined();
  });

  it("parses a result with and without an anchor", () => {
    const base = {
      intent: "i", summary: "s", walkthrough: [], confidence: 3, verdict: "v", effort: 1,
      verificationChecks: [],
    };
    expect(parseReviewResult({ ...base, judgements: [judgement({ anchor: "a" })] }).judgements[0].anchor).toBe("a");
    expect(parseReviewResult({ ...base, judgements: [judgement()] }).judgements[0].anchor).toBeUndefined();
  });

  const judgementProps = (schema: Record<string, unknown>) =>
    (schema as any).properties.judgements.items.properties as Record<string, unknown>;

  it("leaves anchor out of the model's schema unless asked", () => {
    expect(judgementProps(reviewResultJsonSchema())).not.toHaveProperty("anchor");
    expect(judgementProps(reviewResultJsonSchema({ anchor: false }))).not.toHaveProperty("anchor");
  });

  it("offers anchor, optionally, when asked — still draft-07 with no $schema", () => {
    const schema = reviewResultJsonSchema({ anchor: true });
    expect(judgementProps(schema)).toHaveProperty("anchor");
    expect((schema as any).properties.judgements.items.required).not.toContain("anchor");
    expect(schema).not.toHaveProperty("$schema");
  });

  it("is otherwise the same schema either way", () => {
    const on = reviewResultJsonSchema({ anchor: true }) as any;
    const off = reviewResultJsonSchema() as any;
    delete on.properties.judgements.items.properties.anchor;
    expect(on).toEqual(off);
  });
});

describe("prompt", () => {
  const input = (experiments?: string[]): ReviewInput => ({
    pr: {
      owner: "a", repo: "b", number: 1, title: "t", body: "", author: "d", url: "u",
      baseRef: "main", headRef: "h", headSha: "s", isDraft: false, labels: [],
    },
    files: [{ path: "src/limit.ts", status: "added", additions: 1, deletions: 0, patch: PATCH }],
    config: KomodoConfigSchema.parse({}),
    experiments,
  } as ReviewInput);

  it("does not mention anchors unless the experiment is on", () => {
    expect(buildReviewPrompt(input())).not.toContain("anchor");
    expect(buildReviewPrompt(input([]))).not.toContain("anchor");
    expect(buildReviewPrompt(input(["other"]))).not.toContain("anchor");
    expect(buildReviewPrompt(input())).toBe(buildReviewPrompt(input([])));
  });

  it("asks for a verbatim anchor when it is on", () => {
    const prompt = buildReviewPrompt(input(["pin"]));
    expect(prompt).toContain("`anchor`");
    expect(prompt).toContain(pinPromptField(["pin"]));
    expect(pinPromptField(undefined)).toBe("");
  });
});

describe("runReview with the pin experiment", () => {
  const dirs: string[] = [];
  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });
  const outDir = () => {
    const dir = mkdtempSync(join(tmpdir(), "komodo-pin-"));
    dirs.push(dir);
    return dir;
  };

  const github = {
    async getPR(r: { owner: string; repo: string; number: number }) {
      return {
        ...r, title: "Limits", body: "", author: "dev", url: "u",
        baseRef: "main", headRef: "limits", headSha: "abc123", isDraft: false, labels: [],
      };
    },
    async listFiles() {
      return [{ path: "src/limit.ts", status: "added", additions: 6, deletions: 0, patch: PATCH }];
    },
  } as unknown as GitHubClient;

  const base: ReviewResult = {
    intent: "i", summary: "s", walkthrough: [], confidence: 3, verdict: "v", effort: 1,
    verificationChecks: [],
    // Line 14 is nowhere in the diff, and further than the existing snap reaches.
    judgements: [judgement({ line: 14, anchor: "return count;" })],
  };

  const run = async (experiments?: string[]) => {
    const seen: ReviewInput[] = [];
    const provider: ReviewProvider = {
      name: "fake",
      async review(input) {
        seen.push(input);
        return base;
      },
    };
    const outcome = await runReview({
      ref: { owner: "a", repo: "b", number: 1 },
      provider, github, config: KomodoConfigSchema.parse({}), post: false, outDir: outDir(),
      experiments,
    });
    return { outcome, seen };
  };

  it("rescues a judgement whose line was off the diff", async () => {
    const lines: string[] = [];
    const seen: ReviewInput[] = [];
    const provider: ReviewProvider = {
      name: "fake",
      async review(input) {
        seen.push(input);
        return base;
      },
    };
    const { droppedJudgements, record, pin } = await runReview({
      ref: { owner: "a", repo: "b", number: 1 },
      provider, github, config: KomodoConfigSchema.parse({}), post: false, outDir: outDir(),
      experiments: ["pin"], onProgress: (m) => lines.push(m),
    });
    expect(droppedJudgements).toHaveLength(0);
    expect(record.result.judgements.map((j) => j.line)).toEqual([7]);
    expect(pin).toMatchObject({ anchored: 1, moved: 1, unmatched: 0 });
    expect(seen[0].experiments).toEqual(["pin"]);
    expect(lines).toContain("  pin: 1 anchored, 1 moved, 0 not found in the diff (kept where they were).");
  });

  it("changes nothing when the experiment is off", async () => {
    const { outcome, seen } = await run();
    expect(outcome.pin).toBeUndefined();
    expect(seen[0].experiments).toBeUndefined();
    expect(outcome.record.result.judgements).toHaveLength(0);
    expect(outcome.droppedJudgements.map((j) => j.line)).toEqual([14]);
  });

  it("ignores experiment names it does not know", async () => {
    const { outcome } = await run(["something-else"]);
    expect(outcome.pin).toBeUndefined();
    expect(outcome.droppedJudgements).toHaveLength(1);
  });

  it("falls back to the existing snap when the quote is not in the diff", async () => {
    const provider: ReviewProvider = {
      name: "fake",
      async review() {
        return { ...base, judgements: [judgement({ line: 9, anchor: "never written" })] };
      },
    };
    const { record, pin } = await runReview({
      ref: { owner: "a", repo: "b", number: 1 },
      provider, github, config: KomodoConfigSchema.parse({}), post: false, outDir: outDir(),
      experiments: ["pin"],
    });
    // Line 9 is not in the diff; the existing snap moves it to 8, three lines of leeway.
    expect(record.result.judgements.map((j) => j.line)).toEqual([8]);
    expect(pin).toMatchObject({ anchored: 1, moved: 0, unmatched: 1 });
  });
});
