import { describe, expect, it } from "vitest";

import type { ReviewResult } from "@komodo/core";

import { impactOf, isSecurityFinding, toFindings, toJudgment } from "../src/map.js";

function judgement(over: Partial<ReviewResult["judgements"][number]> = {}) {
  return {
    path: "src/db.ts",
    line: 12,
    severity: "major" as const,
    kind: "Risk" as const,
    tag: "changes how queries are built",
    title: "User input reaches the SQL builder unescaped.",
    lede: "The search term is interpolated straight into the query.",
    detail: "A parameterised query would cost nothing here.",
    ask: "Should this move to a bound parameter?",
    sources: ["the diff"],
    sourceNote: "The diff shows the interpolation.",
    code: "src/db.ts:12",
    options: [],
    fixPrompt: "Parameterise the query.",
    ...over,
  } as ReviewResult["judgements"][number];
}

function result(over: Partial<ReviewResult> = {}): ReviewResult {
  return {
    summary: "",
    walkthrough: [],
    confidence: 3,
    verdict: "Needs a second look",
    effort: 2,
    judgements: [judgement()],
    ...over,
  } as ReviewResult;
}

describe("impactOf", () => {
  it("takes the worst judgement, not the most common", () => {
    expect(
      impactOf(result({
        judgements: [
          judgement({ severity: "trivial" }),
          judgement({ severity: "trivial" }),
          judgement({ severity: "critical" }),
        ],
      })),
    ).toBe("critical");
  });

  it("is low when a review found nothing", () => {
    expect(impactOf(result({ judgements: [] }))).toBe("low");
  });
});

describe("isSecurityFinding", () => {
  it("reads what the reviewer wrote rather than guessing from severity", () => {
    expect(
      isSecurityFinding(judgement({ severity: "minor", title: "This is an injection risk." })),
    ).toBe(true);
    // A critical race condition is a bug, not a vulnerability.
    expect(
      isSecurityFinding(
        judgement({
          severity: "critical",
          tag: "changes the sync order",
          title: "Two workers can interleave here.",
          lede: "The second write clobbers the first.",
          sourceNote: "The diff shows both paths.",
        }),
      ),
    ).toBe(false);
  });
});

describe("toFindings", () => {
  it("folds four core severities into the three a finding row has", () => {
    const findings = toFindings(
      result({
        judgements: [
          judgement({ severity: "critical" }),
          judgement({ severity: "major" }),
          judgement({ severity: "minor" }),
          judgement({ severity: "trivial" }),
        ],
      }),
    );
    expect(findings.map((f) => f.severity)).toEqual(["P0", "P1", "P2", "P2"]);
  });

  it("keeps the consequence-first order the reviewer wrote", () => {
    const [f] = toFindings(result());
    expect(f.body.indexOf("interpolated")).toBeLessThan(f.body.indexOf("parameterised"));
    expect(f.filePath).toBe("src/db.ts");
  });
});

describe("toJudgment", () => {
  it("never lets the verdict disagree with the score", () => {
    expect(toJudgment("pr", "sha", result({ confidence: 5, judgements: [] })).verdict)
      .toBe("ship");
    expect(toJudgment("pr", "sha", result({ confidence: 1 })).verdict).toBe("blocked");
  });

  it("downgrades a confident review that found something critical", () => {
    const j = toJudgment("pr", "sha", result({
      confidence: 4,
      judgements: [judgement({ severity: "critical" })],
    }));
    expect(j.impact).toBe("critical");
    expect(j.verdict).toBe("needs_work");
  });

  it("keys the judgment on the head it reviewed", () => {
    const j = toJudgment("acme/api#7", "abc123", result());
    expect(j.prId).toBe("acme/api#7");
    expect(j.headSha).toBe("abc123");
    expect(j.status).toBe("completed");
  });
});
