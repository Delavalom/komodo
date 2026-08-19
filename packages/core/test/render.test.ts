import { describe, expect, it } from "vitest";
import { KomodoConfigSchema } from "../src/config.js";
import type { PRMeta } from "../src/github.js";
import {
  renderJudgementComment,
  renderReviewBody,
  renderWalkthroughComment,
  WALKTHROUGH_MARKER,
} from "../src/render/markdown.js";
import type { Judgement, ReviewResult } from "../src/schema.js";

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

const judgement: Judgement = {
  path: "src/db.ts",
  line: 12,
  severity: "critical",
  kind: "Risk",
  tag: "how users are looked up",
  title: "User input is pasted straight into the query.",
  lede: "Anyone who can type into the search box can ask the database for anything it holds.",
  detail: "Passing the value as a parameter closes it and costs nothing at runtime.",
  ask: "Is there a reason this has to build the query by hand?",
  sources: ["the diff"],
  sourceNote: "Read from the diff alone. Nothing in the change explains the choice.",
  code: "src/db.ts:12   db.query(`SELECT * FROM users WHERE id = ${id}`)",
  options: [
    { label: "No — parameterize it before merge", bucket: "Blocks" },
    { label: "Yes — the input is already trusted here", bucket: "Agreed" },
    { label: "I have a question first", bucket: "Asked" },
    { label: "Not my call — hand it to someone who knows", bucket: "Passed on" },
  ],
  suggestion: 'db.query("SELECT * FROM users WHERE id = $1", [id]);',
  fixPrompt: "In src/db.ts line 12, replace string interpolation with a parameterized query.",
};

const result: ReviewResult = {
  summary: "- **Bug Fixes**: hardened the user query",
  walkthrough: [{ files: ["src/db.ts", "src/db.test.ts"], summary: "Parameterized user lookups" }],
  confidence: 2,
  verdict: "Blocking security issue in the query layer.",
  effort: 3,
  diagram: "sequenceDiagram\n  A->>B: pay()",
  judgements: [judgement],
};

describe("renderWalkthroughComment", () => {
  const config = KomodoConfigSchema.parse({});
  const md = renderWalkthroughComment(pr, result, config);

  it("carries the marker for upsert", () => {
    expect(md).toContain(WALKTHROUGH_MARKER);
  });
  it("renders confidence bar, walkthrough table and mermaid", () => {
    expect(md).toContain("🟩🟩⬜⬜⬜ **2/5**");
    expect(md).toContain("| Files | Change summary |");
    expect(md).toContain("`src/db.ts`<br>`src/db.test.ts`");
    expect(md).toContain("```mermaid");
  });
});

describe("renderJudgementComment", () => {
  const md = renderJudgementComment(judgement);
  it("has severity, kind, the question, provenance, suggestion block and agent prompt", () => {
    expect(md).toContain("🔴 Critical");
    expect(md).toContain("A risk was taken");
    expect(md).toContain("**The question:** Is there a reason this has to build the query by hand?");
    expect(md).toContain("Read from the diff.");
    expect(md).toContain("```suggestion\ndb.query(");
    expect(md).toContain("Prompt for AI agents");
  });
});

describe("renderReviewBody", () => {
  it("summarizes counts", () => {
    expect(renderReviewBody(result)).toContain("1 judgement");
  });
  it("handles clean reviews", () => {
    expect(renderReviewBody({ ...result, judgements: [] })).toContain("nothing worth judging");
  });
});
