import { describe, expect, it } from "vitest";
import { KomodoConfigSchema } from "../src/config.js";
import type { PRMeta } from "../src/github.js";
import {
  renderFindingComment,
  renderReviewBody,
  renderWalkthroughComment,
  WALKTHROUGH_MARKER,
} from "../src/render/markdown.js";
import type { Finding, ReviewResult } from "../src/schema.js";

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

const finding: Finding = {
  path: "src/db.ts",
  line: 12,
  severity: "critical",
  category: "security",
  title: "SQL injection via string interpolation",
  body: "User input is interpolated directly into the query.",
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
  findings: [finding],
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

describe("renderFindingComment", () => {
  const md = renderFindingComment(finding);
  it("has severity, category, suggestion block, and agent prompt", () => {
    expect(md).toContain("🔴 Critical");
    expect(md).toContain("🔒 Security");
    expect(md).toContain("```suggestion\ndb.query(");
    expect(md).toContain("Prompt for AI agents");
  });
});

describe("renderReviewBody", () => {
  it("summarizes counts", () => {
    expect(renderReviewBody(result)).toContain("1 finding");
  });
  it("handles clean reviews", () => {
    expect(renderReviewBody({ ...result, findings: [] })).toContain("no blocking issues");
  });
});
