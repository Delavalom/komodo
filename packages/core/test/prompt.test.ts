import { describe, expect, it } from "vitest";
import { KomodoConfigSchema } from "../src/config.js";
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
