import { describe, expect, it } from "vitest";

import { emptyPinStats, locateAnchor, newSideHunks, pinJudgement, pinResult, withPinning } from "../src/pin.js";
import type { ReviewInput, ReviewProvider } from "../src/providers/types.js";
import type { ReviewResult } from "../src/schema.js";
import { judgement, PATCH } from "./pin-fixtures.js";

const hunks = newSideHunks(PATCH);

describe("newSideHunks", () => {
  it("numbers context and added lines on the new side and skips deletions", () => {
    expect(hunks).toHaveLength(2);
    expect(hunks[0].map((l) => l.line)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(hunks[0][2]).toEqual({ line: 3, text: "export function limit(count: number, max: number) {" });
    expect(hunks[1].map((l) => l.line)).toEqual([20, 21, 22, 23, 24]);
  });

  it("drops the carriage return of a CRLF patch and ignores text before the first hunk", () => {
    const parsed = newSideHunks("diff --git a b\n@@ -1 +1 @@\n+a\r\n");
    expect(parsed[0]).toEqual([{ line: 1, text: "a" }]);
  });

  it("returns nothing for an empty patch", () => {
    expect(newSideHunks("")).toEqual([]);
  });
});

describe("locateAnchor — exact", () => {
  it("finds a single line", () => {
    expect(locateAnchor("if (count > max) {", hunks)).toEqual({ line: 4, tier: "exact" });
  });

  it("finds a run of lines and reports its range", () => {
    expect(locateAnchor("if (count > max) {\n  return null;\n}", hunks, { line: 4 })).toEqual({
      line: 4,
      endLine: 6,
      tier: "exact",
    });
  });

  it("ignores indentation and trailing space", () => {
    expect(locateAnchor("\t\t  return count;  \n", hunks)).toEqual({ line: 7, tier: "exact" });
  });

  it("strips a diff marker the model copied along", () => {
    expect(locateAnchor("+  return count;", hunks)).toEqual({ line: 7, tier: "exact" });
    expect(locateAnchor("+if (count > max) {\n+  return null;", hunks, { line: 4 })).toEqual({
      line: 4,
      endLine: 5,
      tier: "exact",
    });
  });

  it("strips the line-number gutter the model copied from the annotated diff", () => {
    expect(locateAnchor("    4 +  if (count > max) {\n    5 +    return null;", hunks, { line: 4 })).toEqual({
      line: 4,
      endLine: 5,
      tier: "exact",
    });
  });

  it("leaves a real line that begins with a number alone", () => {
    const h = newSideHunks("@@ -0,0 +1,2 @@\n+12 monkeys\n+13 ghosts");
    expect(locateAnchor("12 monkeys", h)).toEqual({ line: 1, tier: "exact" });
  });

  it("bridges a blank line the model left out", () => {
    // Lines 1 and 3 with the blank line 2 between them.
    expect(locateAnchor('import { x } from "./x";\nexport function limit(count: number, max: number) {', hunks)).toEqual({
      line: 1,
      endLine: 3,
      tier: "exact",
    });
  });

  it("ignores a blank line inside the quote", () => {
    expect(locateAnchor("if (count > max) {\n\n  return null;", hunks, { line: 4 })).toEqual({
      line: 4,
      endLine: 5,
      tier: "exact",
    });
  });

  it("never matches across two hunks", () => {
    // Last line of hunk 1 followed by first line of hunk 2.
    expect(locateAnchor("}\nfunction other(flag: boolean) {", hunks)).toBeNull();
  });

  it("does not match deleted lines", () => {
    expect(locateAnchor("const gone = 1;", hunks)).toBeNull();
  });
});

describe("locateAnchor — duplicates", () => {
  it("picks the match nearest the cited line", () => {
    expect(locateAnchor("return null;", hunks, { line: 5 })).toEqual({ line: 5, tier: "exact" });
    expect(locateAnchor("return null;", hunks, { line: 22 })).toEqual({ line: 22, tier: "exact" });
  });

  it("picks the nearer one when the cited line is between them", () => {
    expect(locateAnchor("return null;", hunks, { line: 9 })).toEqual({ line: 5, tier: "exact" });
    expect(locateAnchor("return null;", hunks, { line: 18 })).toEqual({ line: 22, tier: "exact" });
  });

  it("treats a match inside the cited range as distance zero", () => {
    expect(locateAnchor("return null;", hunks, { line: 20, endLine: 23 })).toEqual({ line: 22, tier: "exact" });
  });

  it("takes the earlier of two equally near matches", () => {
    const h = newSideHunks("@@ -1,5 +1,5 @@\n+x();\n+a\n+b\n+c\n+x();");
    expect(locateAnchor("x();", h, { line: 3 })).toEqual({ line: 1, tier: "exact" });
  });

  it("takes the first match when there is no usable line to be near", () => {
    expect(locateAnchor("return null;", hunks)).toEqual({ line: 5, tier: "exact" });
    expect(locateAnchor("return null;", hunks, { line: 0 })).toEqual({ line: 5, tier: "exact" });
  });

  it("lets a stricter tier beat a nearer looser one", () => {
    // `return count` is exact at 7; at line 22 only a fragment of "return null" exists.
    const m = locateAnchor("return count;", hunks, { line: 22 });
    expect(m).toEqual({ line: 7, tier: "exact" });
  });
});

describe("locateAnchor — whitespace-insensitive and re-wrapped", () => {
  it("matches when the model squeezed or spread the whitespace", () => {
    expect(locateAnchor("if(count>max){", hunks)).toEqual({ line: 4, tier: "loose" });
    expect(locateAnchor("export  function  limit( count : number , max : number ) {", hunks)).toEqual({
      line: 3,
      tier: "loose",
    });
  });

  it("matches a quote the model joined onto one line", () => {
    expect(locateAnchor("if (count > max) { return null; }", hunks, { line: 4 })).toEqual({
      line: 4,
      endLine: 6,
      tier: "loose",
    });
  });

  it("matches a quote the model split across lines differently", () => {
    expect(locateAnchor("export function limit(\ncount: number, max: number) {", hunks)).toEqual({
      line: 3,
      tier: "loose",
    });
  });
});

describe("locateAnchor — fragment", () => {
  it("matches a quote that is part of a line", () => {
    expect(locateAnchor("count > max", hunks)).toEqual({ line: 4, tier: "fragment" });
  });

  it("matches a quote that starts mid-line and ends mid-line over several", () => {
    const m = locateAnchor("(count > max) {\nreturn null;", hunks, { line: 4 });
    expect(m).toEqual({ line: 4, endLine: 5, tier: "fragment" });
  });

  it("does not stretch the range over lines the quote does not need", () => {
    // The quote sits wholly in line 7; line 6 must not be dragged in.
    expect(locateAnchor("count;", hunks)).toEqual({ line: 7, tier: "fragment" });
  });

  it("refuses a fragment too short to be evidence", () => {
    expect(locateAnchor("}", hunks)).toEqual({ line: 6, tier: "exact" }); // whole line, so still exact
    expect(locateAnchor(")", hunks)).toBeNull();
    expect(locateAnchor("ax", hunks)).toBeNull();
  });
});

describe("locateAnchor — fuzzy", () => {
  it("matches a quote with a small typo", () => {
    expect(locateAnchor("if (count >= max) {", hunks)).toEqual({ line: 4, tier: "fuzzy" });
  });

  it("matches a multi-line quote with typos in it", () => {
    expect(locateAnchor("if (cuont > max) {\n  retrun null;", hunks, { line: 4 })).toEqual({
      line: 4,
      endLine: 5,
      tier: "fuzzy",
    });
  });

  it("is case-insensitive", () => {
    expect(locateAnchor("IF (COUNT >= MAX) {", hunks)).toEqual({ line: 4, tier: "fuzzy" });
  });

  it("prefers the better score over the nearer line", () => {
    const h = newSideHunks("@@ -1,3 +1,3 @@\n+const total = compute(items, taxRate);\n+const other = 1;\n+const total = compute(items, tax);");
    // Quote is a one-character edit of line 3 and a larger edit of line 1.
    const m = locateAnchor("const total = compute(items, tax);", h, { line: 1 });
    expect(m).toEqual({ line: 3, tier: "exact" });
    const typo = locateAnchor("const total = compute(item, tax);", h, { line: 1 });
    expect(typo).toEqual({ line: 3, tier: "fuzzy" });
  });

  it("breaks an equal-score tie by the cited line", () => {
    const h = newSideHunks("@@ -1,5 +1,5 @@\n+let value = readConfig(a);\n+gap\n+gap2\n+gap3\n+let value = readConfig(a);");
    expect(locateAnchor("let valu = readConfig(a);", h, { line: 5 })).toEqual({ line: 5, tier: "fuzzy" });
    expect(locateAnchor("let valu = readConfig(a);", h, { line: 1 })).toEqual({ line: 1, tier: "fuzzy" });
  });

  it("refuses text that is merely similar in shape", () => {
    expect(locateAnchor("while (queue.length > limit) {", hunks)).toBeNull();
    expect(locateAnchor("totally unrelated sentence about nothing", hunks)).toBeNull();
  });

  it("does not let nine good lines carry one that is unrelated", () => {
    const body = Array.from({ length: 9 }, (_, i) => `+const value${i} = compute(${i});`);
    const h = newSideHunks(["@@ -0,0 +1,10 @@", ...body, "+zzzzzzzzzzzzzzzzzzzzzzzzzzz"].join("\n"));
    const quote = [...body.map((b) => b.slice(1).replace("compute", "compte")), "return somethingElse();"].join("\n");
    expect(locateAnchor(quote, h)).toBeNull();
  });

  it("does not hang on a pathological line", () => {
    const long = "x".repeat(50_000);
    const h = newSideHunks(`@@ -0,0 +1,2 @@\n+${long}\n+${long}y`);
    const started = Date.now();
    expect(locateAnchor("y".repeat(60_000), h)).toBeNull();
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe("locateAnchor — nothing to find", () => {
  it("returns null for an empty or blank anchor", () => {
    expect(locateAnchor("", hunks)).toBeNull();
    expect(locateAnchor("  \n \n", hunks)).toBeNull();
  });

  it("returns null when the quote is not in the diff", () => {
    expect(locateAnchor("await database.transaction(async (tx) => {", hunks)).toBeNull();
  });

  it("returns null against no hunks", () => {
    expect(locateAnchor("return null;", [])).toBeNull();
  });
});

describe("pinJudgement", () => {
  it("moves a drifted line onto the quoted code", () => {
    const { judgement: out, outcome, match } = pinJudgement(judgement({ line: 7, anchor: "return null;" }), PATCH);
    expect(outcome).toBe("pinned");
    expect(match?.tier).toBe("exact");
    expect(out.line).toBe(5);
    expect(out.endLine).toBeUndefined();
    expect(out.anchor).toBe("return null;");
  });

  it("replaces the model's range with the anchor's", () => {
    const { judgement: out } = pinJudgement(
      judgement({ line: 3, endLine: 9, anchor: "if (count > max) {\n  return null;\n}" }),
      PATCH,
    );
    expect(out).toMatchObject({ line: 4, endLine: 6 });
  });

  it("drops a stale endLine when the anchor is a single line", () => {
    const { judgement: out } = pinJudgement(judgement({ line: 3, endLine: 9, anchor: "return count;" }), PATCH);
    expect(out.line).toBe(7);
    expect("endLine" in out).toBe(false);
  });

  it("keeps the model's line when the quote is not in the patch", () => {
    const j = judgement({ line: 7, anchor: "something the model made up entirely" });
    const result = pinJudgement(j, PATCH);
    expect(result.outcome).toBe("unmatched");
    expect(result.judgement).toBe(j);
  });

  it("leaves a judgement without an anchor alone", () => {
    const j = judgement({ line: 7 });
    expect(pinJudgement(j, PATCH)).toEqual({ judgement: j, outcome: "unanchored" });
    expect(pinJudgement(judgement({ anchor: "   " }), PATCH).outcome).toBe("unanchored");
  });

  it("leaves a cross-cutting or file-less judgement alone", () => {
    expect(pinJudgement(judgement({ line: 0, anchor: "return null;" }), PATCH).outcome).toBe("unanchored");
    expect(pinJudgement(judgement({ path: "", anchor: "return null;" }), PATCH).outcome).toBe("unanchored");
  });

  it("leaves a judgement whose file has no patch alone", () => {
    expect(pinJudgement(judgement({ anchor: "return null;" }), undefined).outcome).toBe("unanchored");
  });

  it("is idempotent", () => {
    const once = pinJudgement(judgement({ line: 7, anchor: "return null;" }), PATCH).judgement;
    expect(pinJudgement(once, PATCH).judgement).toEqual(once);
  });

  it("always lands on a line GitHub can comment on", () => {
    // Every line in `hunks` is context or added by construction; spot-check the range end too.
    const { judgement: out } = pinJudgement(judgement({ line: 1, anchor: "if (flag) {\n  return null;" }), PATCH);
    expect(out).toMatchObject({ line: 21, endLine: 22 });
  });
});

describe("pinResult and withPinning", () => {
  const files = [
    { path: "src/limit.ts", patch: PATCH },
    { path: "src/no-patch.ts" },
  ];
  const result: ReviewResult = {
    intent: "i", summary: "s", walkthrough: [], confidence: 3, verdict: "v", effort: 1,
    verificationChecks: [],
    judgements: [
      judgement({ line: 9, anchor: "return count;" }),
      judgement({ line: 2, anchor: "invented()" }),
      judgement({ line: 5 }),
      judgement({ path: "src/no-patch.ts", line: 3, anchor: "return null;" }),
    ],
  };

  it("pins what it can, counts everything, and passes the rest through", () => {
    const stats = emptyPinStats();
    const out = pinResult(result, files, stats);
    expect(out.judgements.map((j) => j.line)).toEqual([7, 2, 5, 3]);
    expect(stats).toEqual({
      anchored: 2,
      moved: 1,
      unmatched: 1,
      tiers: { exact: 1, loose: 0, fragment: 0, fuzzy: 0 },
    });
    expect(out.intent).toBe("i");
  });

  it("does not count a pin that left the line where it was as moved", () => {
    const stats = emptyPinStats();
    pinResult({ ...result, judgements: [judgement({ line: 7, anchor: "return count;" })] }, files, stats);
    expect(stats).toMatchObject({ anchored: 1, moved: 0 });
  });

  it("pins every pass a wrapped provider returns, and keeps its name", async () => {
    const seen: ReviewInput[] = [];
    const inner: ReviewProvider = {
      name: "fake",
      async review(input) {
        seen.push(input);
        return result;
      },
    };
    const stats = emptyPinStats();
    const wrapped = withPinning(inner, files, stats);
    expect(wrapped.name).toBe("fake");
    const input = { pass: { kind: "base" } } as ReviewInput;
    const out = await wrapped.review(input);
    expect(seen[0]).toBe(input);
    expect(out.judgements[0].line).toBe(7);
  });
});
