import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { KomodoConfigSchema } from "../src/config.js";
import type { GitHubClient } from "../src/github.js";
import { runReview } from "../src/pipeline.js";
import type { ReviewProvider } from "../src/providers/types.js";
import {
  applyReflection,
  buildReflectionPrompt,
  reflectionJsonSchema,
  runReflection,
  type ReflectInput,
  type ReflectionResult,
  type ReflectionVerdict,
} from "../src/reflect.js";
import type { Judgement, ReviewResult } from "../src/schema.js";

const judgement = (over: Partial<Judgement> = {}): Judgement => ({
  path: "src/a.ts",
  line: 12,
  endLine: 14,
  severity: "major",
  kind: "Risk",
  focus: "code",
  tag: "t",
  title: "The limiter never resets after a failure.",
  lede: "A failed call leaves the counter at its limit, so every later call is refused until a restart.",
  detail: "Resetting in a finally block would keep it honest, or the counter could expire on its own.",
  ask: "Should a failed call count against the limit at all?",
  sources: ["the diff"],
  sourceNote: "s",
  code: "src/a.ts:12   count += 1",
  options: [
    { label: "a", bucket: "Blocks" },
    { label: "b", bucket: "Agreed" },
    { label: "I have a question first", bucket: "Asked" },
    { label: "Not my call", bucket: "Passed on" },
  ],
  suggestion: "count = 0;",
  fixPrompt: "f",
  ...over,
});

const verdict = (id: string, over: Partial<ReflectionVerdict> = {}): ReflectionVerdict => ({
  id,
  analysis: "checked",
  verdict: "keep",
  reason: "holds",
  revision: null,
  ...over,
});

const revision = (over: Partial<NonNullable<ReflectionVerdict["revision"]>> = {}) => ({
  title: null, lede: null, detail: null, ask: null, line: null, endLine: null, ...over,
});

describe("applyReflection", () => {
  it("keeps what is kept, and keeps what has no verdict", () => {
    const a = judgement({ title: "A." });
    const b = judgement({ title: "B." });
    const out = applyReflection([a, b], { verdicts: [verdict("j-0")] });
    expect(out.kept).toEqual([a, b]);
    expect(out.dropped).toEqual([]);
  });

  it("drops with the reason it was given", () => {
    const a = judgement({ title: "A." });
    const b = judgement({ title: "B." });
    const out = applyReflection([a, b], {
      verdicts: [verdict("j-0", { verdict: "drop", reason: "src/a.ts:13 already resets it." })],
    });
    expect(out.kept).toEqual([b]);
    expect(out.dropped).toEqual([{ judgement: a, reason: "src/a.ts:13 already resets it." }]);
  });

  it("gives a drop with no reason one anyway", () => {
    const out = applyReflection([judgement()], { verdicts: [verdict("j-0", { verdict: "drop", reason: " " })] });
    expect(out.dropped[0].reason).not.toBe("");
  });

  it("applies a revision that shortens text and narrows the range", () => {
    const j = judgement();
    const out = applyReflection([j], {
      verdicts: [
        verdict("j-0", {
          verdict: "revise",
          revision: revision({ lede: "A failed call leaves the counter at its limit.", line: 13, endLine: 13 }),
        }),
      ],
    });
    expect(out.revised).toBe(1);
    expect(out.kept[0]).toMatchObject({
      lede: "A failed call leaves the counter at its limit.",
      line: 13,
      path: "src/a.ts",
      title: j.title,
    });
    expect(out.kept[0].endLine).toBeUndefined();
    // A suggestion written for lines 12-14 must not be applied to line 13.
    expect(out.kept[0].suggestion).toBeUndefined();
  });

  it("keeps the suggestion when the range is untouched", () => {
    const out = applyReflection([judgement()], {
      verdicts: [verdict("j-0", { verdict: "revise", revision: revision({ ask: "Should a failure count?" }) })],
    });
    expect(out.kept[0].suggestion).toBe("count = 0;");
    expect(out.kept[0].ask).toBe("Should a failure count?");
  });

  it("refuses text that got longer, empty text, and a range that grew or moved outside", () => {
    const j = judgement();
    for (const bad of [
      revision({ title: `${j.title} And it is also slow.` }),
      revision({ lede: "  " }),
      revision({ line: 10 }),
      revision({ endLine: 20 }),
      revision({ line: 15 }),
      revision({ line: 14, endLine: 13 }),
    ]) {
      const out = applyReflection([j], { verdicts: [verdict("j-0", { verdict: "revise", revision: bad })] });
      expect(out.kept).toEqual([j]);
      expect(out.revised).toBe(0);
      expect(out.ignored).toHaveLength(1);
    }
  });

  it("applies the legal half of a mixed revision", () => {
    const j = judgement();
    const out = applyReflection([j], {
      verdicts: [
        verdict("j-0", {
          verdict: "revise",
          revision: revision({ title: "It never resets.", line: 1, endLine: 5 }),
        }),
      ],
    });
    expect(out.kept[0].title).toBe("It never resets.");
    expect(out.kept[0].line).toBe(12);
    expect(out.kept[0].endLine).toBe(14);
  });

  it("cannot move a cross-cutting judgement onto a line", () => {
    const j = judgement({ path: "", line: 0, endLine: undefined });
    const out = applyReflection([j], {
      verdicts: [verdict("j-0", { verdict: "revise", revision: revision({ line: 3, endLine: 3 }) })],
    });
    expect(out.kept).toEqual([j]);
  });

  it("cannot change path, severity, kind, focus, options or sources, even if the model tries", () => {
    const j = judgement();
    const sneaky = {
      ...verdict("j-0", { verdict: "revise", revision: revision({ title: "It never resets." }) }),
      path: "src/evil.ts",
      severity: "critical",
      revision: { ...revision({ title: "It never resets." }), path: "src/evil.ts", severity: "critical" },
    } as unknown as ReflectionVerdict;
    const out = applyReflection([j], { verdicts: [sneaky] });
    expect(out.kept[0]).toMatchObject({
      path: j.path, severity: j.severity, kind: j.kind, focus: j.focus, options: j.options, sources: j.sources,
      title: "It never resets.",
    });
  });

  it("cannot invent a finding: unknown ids are ignored and the count never grows", () => {
    const j = judgement();
    const out = applyReflection([j], {
      verdicts: [verdict("j-0"), verdict("j-7", { verdict: "revise", revision: revision({ title: "New." }) })],
    });
    expect(out.kept).toEqual([j]);
    expect(out.ignored).toEqual(["j-7: no such judgement"]);
  });

  it("uses the first answer when a judgement is answered twice", () => {
    const j = judgement();
    const out = applyReflection([j], {
      verdicts: [verdict("j-0"), verdict("j-0", { verdict: "drop", reason: "late" })],
    });
    expect(out.kept).toEqual([j]);
    expect(out.dropped).toEqual([]);
  });
});

describe("buildReflectionPrompt", () => {
  const base: ReflectInput = {
    pr: {
      owner: "acme", repo: "api", number: 1, title: "Limits", body: "", author: "dev",
      url: "u", baseRef: "main", headRef: "h", headSha: "abc", isDraft: false, labels: [],
    },
    files: [{ path: "src/a.ts", status: "modified", additions: 1, deletions: 0, patch: "@@ -1,0 +12,1 @@\n+count += 1" }],
    judgements: [judgement()],
    config: KomodoConfigSchema.parse({}),
  };

  it("names each judgement by id and place, with the diff and the house voice", () => {
    const prompt = buildReflectionPrompt(base);
    expect(prompt).toContain("### j-0");
    expect(prompt).toContain("src/a.ts:12-14");
    expect(prompt).toContain("count += 1");
    expect(prompt).toContain("How Komodo writes to a person");
  });

  it("only offers a checkout when there is one", () => {
    expect(buildReflectionPrompt(base)).toContain("cannot read the repository");
    expect(buildReflectionPrompt({ ...base, repoDir: "/tmp/x" })).toContain("checkout of the pull request head");
  });

  it("asks for the analysis before the verdict, so the model reasons first", () => {
    const keys = Object.keys(
      (reflectionJsonSchema() as any).properties.verdicts.items.properties,
    );
    expect(keys.indexOf("analysis")).toBeLessThan(keys.indexOf("verdict"));
  });
});

describe("runReflection", () => {
  const input: Omit<ReflectInput, "onUsage"> = {
    pr: {
      owner: "acme", repo: "api", number: 1, title: "t", body: "", author: "dev",
      url: "u", baseRef: "main", headRef: "h", headSha: "abc", isDraft: false, labels: [],
    },
    files: [],
    judgements: [judgement({ title: "A." }), judgement({ title: "B." })],
    config: KomodoConfigSchema.parse({}),
  };
  const provider = (reflect?: ReviewProvider["reflect"]): ReviewProvider => ({
    name: "fake",
    async review() {
      throw new Error("not used");
    },
    reflect,
  });

  it("applies the answer and tallies cost and tokens", async () => {
    const out = await runReflection({
      provider: provider(async (i) => {
        i.onUsage?.({ costUsd: 0.25, inputTokens: 1000, outputTokens: 50 });
        return { verdicts: [verdict("j-0", { verdict: "drop", reason: "wrong" }), verdict("j-1")] };
      }),
      input,
    });
    expect(out.judgements.map((j) => j.title)).toEqual(["B."]);
    expect(out.report).toMatchObject({
      status: "applied", judgementsChecked: 2, kept: 1, costUsd: 0.25, inputTokens: 1000, outputTokens: 50,
    });
    expect(out.report.dropped[0].reason).toBe("wrong");
  });

  it("keeps everything and says so when the call fails, but still counts what it cost", async () => {
    const out = await runReflection({
      provider: provider(async (i) => {
        i.onUsage?.({ costUsd: 0.1 });
        throw new Error("out of turns");
      }),
      input,
    });
    expect(out.judgements).toEqual(input.judgements);
    expect(out.report).toMatchObject({ status: "failed", error: "out of turns", kept: 2, costUsd: 0.1 });
    expect(out.report.dropped).toEqual([]);
  });

  it("keeps everything when the answer is not the schema", async () => {
    const out = await runReflection({
      provider: provider(async () => ({ verdicts: [{ id: "j-0" }] }) as unknown as ReflectionResult),
      input,
    });
    expect(out.judgements).toEqual(input.judgements);
    expect(out.report.status).toBe("failed");
  });

  it("keeps everything and says so for a provider that cannot reflect", async () => {
    const out = await runReflection({ provider: provider(undefined), input });
    expect(out.judgements).toEqual(input.judgements);
    expect(out.report.status).toBe("skipped");
    expect(out.report.error).toContain("fake");
  });

  it("does not call the provider with nothing to check", async () => {
    let called = false;
    const out = await runReflection({
      provider: provider(async () => {
        called = true;
        return { verdicts: [] };
      }),
      input: { ...input, judgements: [] },
    });
    expect(called).toBe(false);
    expect(out.report.status).toBe("skipped");
  });
});

describe("runReview with the reflect experiment", () => {
  const patch = "@@ -0,0 +10,10 @@\n+a\n+b\n+c\n+d\n+e\n+f\n+g\n+h\n+i\n+j";
  const github = {
    async getPR(r: { owner: string; repo: string; number: number }) {
      return {
        ...r, title: "Limits", body: "", author: "dev", url: "u",
        baseRef: "main", headRef: "limits", headSha: "abc123", isDraft: false, labels: [],
      };
    },
    async listFiles() {
      return [{ path: "src/a.ts", status: "modified", additions: 10, deletions: 0, patch }];
    },
  } as unknown as GitHubClient;
  const ref = { owner: "acme", repo: "api", number: 1 };
  const dirs: string[] = [];
  const outDir = () => {
    const dir = mkdtempSync(join(tmpdir(), "komodo-reflect-"));
    dirs.push(dir);
    return dir;
  };
  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });

  const drafted = [
    judgement({ line: 11, endLine: undefined, title: "Wrong one.", suggestion: undefined }),
    judgement({ line: 12, endLine: 15, title: "Right one, too wide." }),
    judgement({ line: 13, endLine: undefined, title: "Fine.", suggestion: undefined }),
  ];
  const result: ReviewResult = {
    intent: "Add a limiter.", summary: "- Adds a limiter", walkthrough: [], confidence: 3,
    verdict: "Read it.", effort: 1, verificationChecks: [], judgements: drafted,
  };

  function fake(reflect?: ReviewProvider["reflect"]) {
    const calls = { review: 0, reflect: 0 };
    const provider: ReviewProvider = {
      name: "fake",
      async review(input) {
        calls.review++;
        input.onUsage?.({ costUsd: 1 });
        return result;
      },
      reflect:
        reflect &&
        (async (input, p) => {
          calls.reflect++;
          return reflect(input, p);
        }),
    };
    return { provider, calls };
  }
  const run = (provider: ReviewProvider, experiments?: string[]) =>
    runReview({
      ref, provider, github, config: KomodoConfigSchema.parse({}), post: false, outDir: outDir(), experiments,
    });

  it("does nothing without the flag: no call, no change, no drops", async () => {
    const { provider, calls } = fake(async () => ({ verdicts: [verdict("j-0", { verdict: "drop" })] }));
    for (const experiments of [undefined, [], ["something-else"]]) {
      const outcome = await run(provider, experiments);
      expect(outcome.reflection).toBeNull();
      expect(outcome.record.result.judgements.map((j) => j.title).sort()).toEqual(
        ["Fine.", "Right one, too wide.", "Wrong one."],
      );
      expect(outcome.droppedJudgements).toEqual([]);
      expect(outcome.record.run?.costUsd).toBe(1);
    }
    expect(calls.reflect).toBe(0);
  });

  it("drops and rewrites between the merge and the filter, and reports what it removed", async () => {
    const { provider } = fake(async (input) => {
      input.onUsage?.({ costUsd: 0.5, inputTokens: 900, outputTokens: 40 });
      return {
        verdicts: [
          verdict("j-0", { verdict: "drop", reason: "src/a.ts:11 already guards it." }),
          verdict("j-1", { verdict: "revise", revision: revision({ line: 12, endLine: 12 }) }),
          verdict("j-2"),
        ],
      };
    });
    const outcome = await run(provider, ["reflect"]);
    const shown = outcome.record.result.judgements;
    expect(shown.map((j) => j.title).sort()).toEqual(["Fine.", "Right one, too wide."]);
    expect(shown.find((j) => j.title === "Right one, too wide.")).toMatchObject({ line: 12, path: "src/a.ts" });
    expect(outcome.droppedJudgements).toMatchObject([
      { title: "Wrong one.", droppedBy: "reflect", dropReason: "src/a.ts:11 already guards it." },
    ]);
    expect(outcome.reflection).toMatchObject({ status: "applied", kept: 2, revised: 1, inputTokens: 900 });
    // The reflection's cost joins the run's; its call is not a pass.
    expect(outcome.record.run).toMatchObject({ costUsd: 1.5, passes: 1 });
  });

  it("still runs the normal filters on what reflection keeps", async () => {
    const { provider } = fake(async () => ({ verdicts: [] }));
    const off = judgement({ line: 99, endLine: undefined, title: "Off the diff.", suggestion: undefined });
    const outcome = await runReview({
      ref, github, config: KomodoConfigSchema.parse({}), post: false, outDir: outDir(),
      experiments: ["reflect"],
      provider: { ...provider, review: async () => ({ ...result, judgements: [...drafted, off] }) },
    });
    expect(outcome.droppedJudgements.map((j) => j.title)).toEqual(["Off the diff."]);
    expect(outcome.droppedJudgements[0].droppedBy).toBeUndefined();
  });

  it("keeps every judgement and reports it when reflection fails", async () => {
    const { provider } = fake(async (input) => {
      input.onUsage?.({ costUsd: 0.2 });
      throw new Error("boom");
    });
    const messages: string[] = [];
    const outcome = await runReview({
      ref, provider, github, config: KomodoConfigSchema.parse({}), post: false, outDir: outDir(),
      experiments: ["reflect"], onProgress: (m) => messages.push(m),
    });
    expect(outcome.record.result.judgements).toHaveLength(3);
    expect(outcome.droppedJudgements).toEqual([]);
    expect(outcome.reflection).toMatchObject({ status: "failed", error: "boom" });
    expect(outcome.record.run?.costUsd).toBeCloseTo(1.2);
    expect(messages.some((m) => m.includes("reflection failed"))).toBe(true);
  });

  it("keeps every judgement for a provider with no reflect", async () => {
    const { provider } = fake(undefined);
    const outcome = await run(provider, ["reflect"]);
    expect(outcome.record.result.judgements).toHaveLength(3);
    expect(outcome.reflection?.status).toBe("skipped");
  });
});
