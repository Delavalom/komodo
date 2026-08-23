/**
 * The skip rules.
 *
 * Every one of these was config the parser accepted and no code read, so the
 * tests are as much a record of what the settings now mean as a guard on the
 * predicate.
 */
import { describe, expect, it } from "vitest";

import { KomodoConfigSchema, type KomodoConfig } from "@komodo/core";
import type { PullRequest } from "@komodo/store";

import { shouldReview } from "../src/review.js";

const config = (over: Record<string, unknown> = {}): KomodoConfig =>
  KomodoConfigSchema.parse(over);

const pr = (over: Partial<PullRequest> = {}): PullRequest => ({
  id: "acme/api#1",
  repoId: "acme/api",
  number: 1,
  title: "Add rate limiting",
  author: "renata",
  url: "https://github.com/acme/api/pull/1",
  headSha: "aaa111",
  state: "open",
  isDraft: false,
  requestedReviewers: [],
  approvals: [],
  changesRequested: [],
  additions: 40,
  deletions: 3,
  changedFiles: 2,
  createdAt: 0,
  updatedAt: 0,
  mergedAt: null,
  ...over,
});

describe("shouldReview", () => {
  it("reviews an ordinary open pull request", () => {
    expect(shouldReview(pr(), config()).skip).toBe(false);
  });

  it("skips a draft by default, and reviews one when told to", () => {
    expect(shouldReview(pr({ isDraft: true }), config()).skip).toBe(true);
    expect(
      shouldReview(pr({ isDraft: true }), config({ auto_review: { drafts: true } })).skip,
    ).toBe(false);
  });

  it("skips a title carrying an ignore keyword, case-insensitively", () => {
    const result = shouldReview(pr({ title: "wip: spike on caching" }), config());
    expect(result.skip).toBe(true);
    expect(result.skip && result.reason).toContain("WIP");
  });

  it("does not treat an empty keyword as matching every title", () => {
    // "".includes() is true for any string, which would skip everything.
    const cfg = config({ auto_review: { ignore_title_keywords: ["", "  "] } });
    expect(shouldReview(pr(), cfg).skip).toBe(false);
  });

  it("skips a filtered author", () => {
    const cfg = config({
      auto_review: { authors: { mode: "exclude", tokens: ["dependabot[bot]"] } },
    });
    expect(shouldReview(pr({ author: "dependabot[bot]" }), cfg).skip).toBe(true);
    expect(shouldReview(pr({ author: "renata" }), cfg).skip).toBe(false);
  });

  it("matches an author regardless of case", () => {
    const cfg = config({
      auto_review: { authors: { mode: "exclude", tokens: ["Dependabot[bot]"] } },
    });
    expect(shouldReview(pr({ author: "dependabot[bot]" }), cfg).skip).toBe(true);
  });

  it("inverts the filter in include mode", () => {
    const cfg = config({
      auto_review: { authors: { mode: "include", tokens: ["renata"] } },
    });
    expect(shouldReview(pr({ author: "renata" }), cfg).skip).toBe(false);
    expect(shouldReview(pr({ author: "marco" }), cfg).skip).toBe(true);
  });

  it("ignores an empty token list rather than skipping everyone", () => {
    const cfg = config({ auto_review: { authors: { mode: "include", tokens: [] } } });
    expect(shouldReview(pr(), cfg).skip).toBe(false);
  });

  it("skips a pull request over the file cap", () => {
    const cfg = config({ auto_review: { max_files: 50 } });
    expect(shouldReview(pr({ changedFiles: 400 }), cfg).skip).toBe(true);
    expect(shouldReview(pr({ changedFiles: 50 }), cfg).skip).toBe(false);
  });

  it("treats a cap of 0 as no cap", () => {
    const cfg = config({ auto_review: { max_files: 0 } });
    expect(shouldReview(pr({ changedFiles: 5000 }), cfg).skip).toBe(false);
  });

  it("says why, so the queue can explain itself", () => {
    const result = shouldReview(pr({ isDraft: true }), config());
    expect(result.skip && result.reason).toBe("draft");
  });
});
