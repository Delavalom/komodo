import { describe, expect, it } from "vitest";
import { KomodoConfigSchema } from "../src/config.js";
import { SAME_SPOT } from "../src/merge.js";
import type { PRMeta } from "../src/github.js";
import { buildReviewPrompt } from "../src/providers/prompt.js";
import { buildRereadPrompt } from "../src/providers/reread.js";
import type { Judgement } from "../src/schema.js";
import { VOICE_STYLE } from "../src/voice.js";

const pr: PRMeta = {
  owner: "acme",
  repo: "app",
  number: 7,
  title: "Add payments",
  body: "",
  author: "dev",
  url: "https://github.com/acme/app/pull/7",
  baseRef: "main",
  headRef: "feat/payments",
  headSha: "abcdef1234567890",
  isDraft: false,
  labels: [],
};

const files = [
  {
    path: "src/settings.tsx",
    status: "modified" as const,
    additions: 1,
    deletions: 1,
    patch: "@@ -1 +1 @@\n-old\n+new",
  },
];

describe("buildReviewPrompt", () => {
  it("carries the house voice instead of its own inline examples", () => {
    const prompt = buildReviewPrompt({ pr, files, config: KomodoConfigSchema.parse({}) });
    expect(prompt).toContain(VOICE_STYLE);
    // The old hardcoded examples this section replaced — a second, competing
    // voice living in the prompt is exactly the drift this asset exists to
    // stop, so a regression here should fail loudly.
    expect(prompt).not.toContain("Renewal tokens are saved in a form that can be read back");
  });

  it("appends a team's own vocabulary after the house voice", () => {
    const config = KomodoConfigSchema.parse({ voice: { extra: "We say \"workflows\", never \"jobs\"." } });
    const prompt = buildReviewPrompt({ pr, files, config });
    expect(prompt).toContain(VOICE_STYLE);
    expect(prompt).toContain("This team's vocabulary");
    expect(prompt).toContain('We say "workflows"');
  });

  it("omits the shared context section when there is none", () => {
    const prompt = buildReviewPrompt({ pr, files, config: KomodoConfigSchema.parse({}) });
    expect(prompt).not.toContain("## Shared context");
  });

  it("renders shared context documents under their own heading", () => {
    const prompt = buildReviewPrompt({
      pr,
      files,
      config: KomodoConfigSchema.parse({}),
      sharedContext: [
        { label: "Company review rules/tools.md", text: "Use the internal linter, never a raw shell call." },
      ],
    });
    expect(prompt).toContain("## Shared context");
    expect(prompt).toContain("### Company review rules/tools.md");
    expect(prompt).toContain("Use the internal linter, never a raw shell call.");
  });

  it("tells the model it may cite shared context in sources", () => {
    const prompt = buildReviewPrompt({ pr, files, config: KomodoConfigSchema.parse({}) });
    expect(prompt).toContain("any shared context documents above");
  });
});

describe("buildRereadPrompt", () => {
  const judgement: Judgement = {
    path: "src/db.ts",
    line: 12,
    severity: "critical",
    kind: "Risk",
    focus: "code",
    tag: "how users are looked up",
    title: "User input is pasted straight into the query.",
    lede: "Anyone who can type into the search box can ask the database for anything it holds.",
    detail: "Passing the value as a parameter closes it and costs nothing at runtime.",
    ask: "Is there a reason this has to build the query by hand?",
    sources: ["the diff"],
    sourceNote: "Read from the diff alone.",
    code: "src/db.ts:12   db.query(...)",
    options: [
      { label: "No — parameterize it before merge", bucket: "Blocks" },
      { label: "Yes — the input is already trusted here", bucket: "Agreed" },
      { label: "I have a question first", bucket: "Asked" },
      { label: "Not my call — hand it to someone who knows", bucket: "Passed on" },
    ],
    fixPrompt: "Parameterize the query in src/db.ts line 12.",
  };

  it("carries the house voice", () => {
    const prompt = buildRereadPrompt({
      judgement,
      question: "Is this actually reachable with untrusted input?",
      reply: "Fixed, see the latest commit.",
      patch: "@@ -12 +12 @@\n-old\n+new",
      headSha: "abcdef1234567890",
    });
    expect(prompt).toContain(VOICE_STYLE);
  });
});

describe("buildReviewPrompt — passes", () => {
  const config = KomodoConfigSchema.parse({});

  it("leaves a standard prompt byte-for-byte as it was", () => {
    expect(buildReviewPrompt({ pr, files, config, pass: { kind: "base" } })).toBe(
      buildReviewPrompt({ pr, files, config }),
    );
  });

  it("adds nothing for a standard single pass", () => {
    expect(buildReviewPrompt({ pr, files, config })).not.toContain("## This pass");
    expect(buildReviewPrompt({ pr, files, config, pass: { kind: "base" } })).not.toContain(
      "## This pass",
    );
  });

  it("narrows a lens pass to its one question", () => {
    const prompt = buildReviewPrompt({ pr, files, config, pass: { kind: "lens", focus: "tests" } });
    expect(prompt).toContain("## This pass");
    expect(prompt).toContain("Only judgements with focus `tests`");
  });

  it("hands a second look what was already raised, and tells it not to repeat it", () => {
    const prior = [
      {
        path: "src/settings.tsx",
        line: 1,
        focus: "code",
        severity: "major",
        title: "The new value is never saved.",
      },
    ] as unknown as Judgement[];
    const prompt = buildReviewPrompt({
      pr,
      files,
      config,
      pass: { kind: "second-look", prior },
    });
    expect(prompt).toContain("Do not repeat them");
    expect(prompt).toContain("- [code, major] src/settings.tsx:1 — The new value is never saved.");
  });

  it("lists file-level and cross-cutting entries without a bogus line number", () => {
    const prior = [
      { path: "src/settings.tsx", line: 0, focus: "tests", severity: "minor", title: "No test\n  reaches   this." },
      { path: "", line: 0, focus: "scope", severity: "major", title: "Rewrites the logger." },
    ] as unknown as Judgement[];
    const prompt = buildReviewPrompt({ pr, files, config, pass: { kind: "second-look", prior } });
    expect(prompt).toContain("- [tests, minor] src/settings.tsx — No test reaches this.");
    expect(prompt).toContain("- [scope, major] (cross-cutting) — Rewrites the logger.");
    expect(prompt).not.toContain(":0");
  });

  it("keeps outside-the-diff reading conditional on a checkout, and merge rules to the second look", () => {
    const lens = buildReviewPrompt({ pr, files, config, pass: { kind: "lens", focus: "architecture" } });
    expect(lens).toContain("If a repository checkout is available, read the configuration");
    expect(lens).not.toContain("How this pass is merged");
    const second = buildReviewPrompt({ pr, files, config, pass: { kind: "second-look", prior: [] } });
    expect(second).toContain("when a checkout is available, files the change depends on");
  });

  it("tells the second look the rules its judgements are merged by", () => {
    // Each sentence here is a branch of mergeResults. If the merge changes and
    // this prompt does not, the model is promised something the merge undoes.
    const second = buildReviewPrompt({ pr, files, config, pass: { kind: "second-look", prior: [] } });
    expect(second).toContain(`within ${SAME_SPOT} lines`);
    expect(second).toContain("the same title");
    expect(second).toContain("replaces the earlier one only when its severity is higher");
    expect(second).toContain("it can only make that check required");
    expect(second).not.toContain("argue with them");
  });
});
