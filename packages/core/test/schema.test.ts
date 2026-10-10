import { describe, expect, it } from "vitest";

import { parseReviewResult } from "../src/schema.js";

function result(overrides: Record<string, unknown> = {}) {
  return {
    summary: "- Adds a rate limiter.",
    walkthrough: [],
    confidence: 4,
    verdict: "Read the limiter and its tests.",
    effort: 2,
    verificationChecks: [],
    judgements: [],
    ...overrides,
  };
}

describe("parseReviewResult", () => {
  it("passes through a result with no diagram unchanged", () => {
    expect(parseReviewResult(result()).diagram).toBeUndefined();
  });

  it("keeps a diagram that stays inside its budget", () => {
    const parsed = parseReviewResult(
      result({
        diagram: {
          type: "sequence",
          actors: [
            { id: "a", name: "Client" },
            { id: "b", name: "Server" },
          ],
          items: [
            { kind: "message", message: { from: "a", to: "b", kind: "call", label: "request", headline: true } },
          ],
        },
      }),
    );
    expect(parsed.diagram?.type).toBe("sequence");
  });

  /**
   * The bug this guards: a diagram over its headline budget used to throw
   * away the whole review — summary, judgements, everything — because the
   * budget is a cross-field `superRefine` the model is never told about
   * (neither the prompt nor the JSON schema handed to it states it). Losing
   * only the diagram is the fix; losing the rest along with it is the bug.
   */
  it("drops a diagram over its headline budget and keeps the rest of the review", () => {
    const parsed = parseReviewResult(
      result({
        verdict: "Real verdict text.",
        diagram: {
          type: "sequence",
          actors: [
            { id: "a", name: "Client" },
            { id: "b", name: "Server" },
          ],
          items: [
            { kind: "message", message: { from: "a", to: "b", kind: "call", label: "one", headline: true } },
            { kind: "message", message: { from: "b", to: "a", kind: "return", label: "two", headline: true } },
            { kind: "message", message: { from: "a", to: "b", kind: "call", label: "three", headline: true } },
          ],
        },
      }),
    );
    expect(parsed.diagram).toBeUndefined();
    expect(parsed.verdict).toBe("Real verdict text.");
  });

  it("still throws on a violation outside the diagram", () => {
    expect(() => parseReviewResult(result({ confidence: 9 }))).toThrow();
  });
});
