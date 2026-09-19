/**
 * The queue's "Review with AI" button and the review page's "Ask AI review"
 * button must agree on when a request makes sense — see ai-state.ts.
 */
import { describe, expect, it } from "vitest";

import { canRequestAiReview, deriveAiState } from "../src/ai-state.js";
import type { AIReviewJob } from "../src/types.js";

const job = (over: Partial<AIReviewJob> = {}): AIReviewJob => ({
  id: "job1",
  prId: "acme/api#1",
  headSha: "aaa111",
  trigger: "manual",
  state: "running",
  requestedBy: null,
  requestedAt: 0,
  updatedAt: 0,
  workerId: null,
  leaseExpiresAt: null,
  lastError: null,
  ...over,
});

describe("deriveAiState", () => {
  it("a durable job wins over any judgment for the same head", () => {
    expect(deriveAiState(job({ state: "queued" }), "completed")).toBe("queued");
    expect(deriveAiState(job({ state: "running" }), null)).toBe("running");
  });

  it("falls back to the judgment when there is no job", () => {
    expect(deriveAiState(null, "completed")).toBe("completed");
    expect(deriveAiState(null, "skipped")).toBe("skipped");
    expect(deriveAiState(null, "pending")).toBe("queued");
  });

  it("treats a judgment in any other status as failed", () => {
    expect(deriveAiState(null, "error")).toBe("failed");
    expect(deriveAiState(null, "usage_limit")).toBe("failed");
    expect(deriveAiState(null, "trial_ended")).toBe("failed");
  });

  it("no job and no judgment at all means never requested", () => {
    expect(deriveAiState(null, null)).toBe("not_requested");
  });
});

describe("canRequestAiReview", () => {
  it("allows a request from a state with no review in flight", () => {
    expect(canRequestAiReview("not_requested")).toBe(true);
    expect(canRequestAiReview("failed")).toBe(true);
    expect(canRequestAiReview("skipped")).toBe(true);
    expect(canRequestAiReview("cancelled")).toBe(true);
  });

  it("refuses a request while one is already in flight or done", () => {
    expect(canRequestAiReview("queued")).toBe(false);
    expect(canRequestAiReview("running")).toBe(false);
    expect(canRequestAiReview("completed")).toBe(false);
  });
});
