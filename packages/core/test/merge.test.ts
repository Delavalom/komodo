import { describe, expect, it } from "vitest";

import { mergeResults, sameConcern } from "../src/merge.js";
import type { Judgement, ReviewResult, VerificationCheck } from "../src/schema.js";

const judgement = (over: Partial<Judgement> = {}): Judgement => ({
  path: "src/wallet.js",
  line: 12,
  severity: "major",
  kind: "Risk",
  focus: "code",
  tag: "changes how balances move",
  title: "Two credits can read the same balance.",
  lede: "Both writes land and one is lost.",
  detail: "A lock or an atomic update avoids it.",
  ask: "Can two credits for one user run at once?",
  sources: ["the diff"],
  sourceNote: "The diff awaits between the read and the write.",
  code: "src/wallet.js:12 const current = getBalance(userId)",
  options: [
    { label: "Yes — serialise them", bucket: "Blocks" },
    { label: "No — one at a time already", bucket: "Agreed" },
    { label: "I have a question first", bucket: "Asked" },
    { label: "Not my call", bucket: "Passed on" },
  ],
  fixPrompt: "Make credit atomic.",
  ...over,
});

const check = (over: Partial<VerificationCheck> = {}): VerificationCheck => ({
  title: "Two concurrent transfers leave the right balances.",
  instruction: "Run two transfers at once against the dev store.",
  expectedResult: "Both balances add up.",
  evidenceKinds: ["test_run"],
  required: false,
  ...over,
});

const result = (over: Partial<ReviewResult> = {}): ReviewResult => ({
  summary: "- Adds async wallet operations",
  walkthrough: [{ files: ["src/wallet.js"], summary: "Credit and transfer go async." }],
  confidence: 3,
  verdict: "Read the wallet changes against the tests.",
  effort: 2,
  verificationChecks: [],
  judgements: [],
  ...over,
});

describe("sameConcern", () => {
  it("treats the same focus on nearby lines of one file as one concern", () => {
    expect(sameConcern(judgement({ line: 12 }), judgement({ line: 15 }))).toBe(true);
    expect(sameConcern(judgement({ line: 12 }), judgement({ line: 16 }))).toBe(false);
  });

  it("keeps a different focus on the same line apart", () => {
    expect(sameConcern(judgement(), judgement({ focus: "tests" }))).toBe(false);
  });

  it("matches cross-cutting judgements by title, ignoring case and punctuation", () => {
    const a = judgement({ path: "", line: 0, focus: "scope", title: "This PR also rewrites the logger." });
    const b = judgement({ path: "", line: 0, focus: "scope", title: "this pr also rewrites the LOGGER" });
    expect(sameConcern(a, b)).toBe(true);
  });
});

describe("sameConcern — file-level judgements", () => {
  it("does not treat line 0 as a real line", () => {
    const a = judgement({ line: 0, focus: "tests", title: "No test reaches the timeout branch." });
    const b = judgement({ line: 0, focus: "tests", title: "No test reaches the retry cap." });
    expect(sameConcern(a, b)).toBe(false);
    expect(sameConcern(a, judgement({ line: 2, focus: "tests" }))).toBe(false);
    expect(sameConcern(a, { ...a, title: "no test reaches the TIMEOUT branch" })).toBe(true);
  });
});

describe("mergeResults", () => {
  it("keeps the base pass's summary, walkthrough and scores", () => {
    const base = result();
    const merged = mergeResults(base, [result({ summary: "- one line", confidence: 1 })]);
    expect(merged.summary).toBe(base.summary);
    expect(merged.walkthrough).toEqual(base.walkthrough);
    expect(merged.confidence).toBe(3);
  });

  it("adds what the extra passes found and drops their repeats", () => {
    const base = result({ judgements: [judgement()] });
    const extra = result({
      judgements: [
        judgement({ line: 13 }),
        judgement({ focus: "tests", line: 0, path: "", title: "Nothing tests a concurrent transfer." }),
      ],
    });
    const merged = mergeResults(base, [extra]);
    expect(merged.judgements).toHaveLength(2);
    expect(merged.judgements[1].focus).toBe("tests");
  });

  it("keeps the more severe of two judgements on the same concern", () => {
    const base = result({ judgements: [judgement({ severity: "minor" })] });
    const merged = mergeResults(base, [result({ judgements: [judgement({ severity: "critical" })] })]);
    expect(merged.judgements).toHaveLength(1);
    expect(merged.judgements[0].severity).toBe("critical");
  });

  it("dedupes checks by title and keeps one required if either was", () => {
    const base = result({ verificationChecks: [check()] });
    const merged = mergeResults(base, [
      result({ verificationChecks: [check({ title: "Two concurrent transfers leave the right balances", required: true })] }),
    ]);
    expect(merged.verificationChecks).toHaveLength(1);
    expect(merged.verificationChecks[0].required).toBe(true);
  });

  it("keeps two distinct nearby judgements from one extra pass", () => {
    const extra = result({
      judgements: [
        judgement({ focus: "tests", line: 12, path: "src/x.ts", severity: "major", title: "No test reaches the timeout branch." }),
        judgement({ focus: "tests", line: 14, path: "src/x.ts", severity: "minor", title: "No test reaches the retry cap." }),
      ],
    });
    const merged = mergeResults(result(), [extra]);
    expect(merged.judgements).toHaveLength(2);
  });

  it("still collapses a repeat across two extra passes", () => {
    const one = result({ judgements: [judgement({ focus: "tests", severity: "minor" })] });
    const two = result({ judgements: [judgement({ focus: "tests", severity: "major", line: 13 })] });
    const merged = mergeResults(result(), [one, two]);
    expect(merged.judgements).toHaveLength(1);
    expect(merged.judgements[0].severity).toBe("major");
  });

  it("never collapses checks whose titles have no letters or digits", () => {
    const merged = mergeResults(result({ verificationChecks: [check({ title: "—" })] }), [
      result({ verificationChecks: [check({ title: "!!" })] }),
    ]);
    expect(merged.verificationChecks).toHaveLength(2);
  });
});
