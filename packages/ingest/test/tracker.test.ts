/**
 * Reading the ticket a pull request names.
 *
 * The key-matching half is the interesting one: `ABC-123` is also the shape of
 * "UTF-8" and "SHA-256", so these tests are mostly a record of what must NOT
 * be treated as an issue key.
 */
import { describe, expect, it } from "vitest";

import { findIssueKeys } from "../src/tracker.js";

describe("findIssueKeys", () => {
  it("finds a key in a title", () => {
    expect(findIssueKeys("ENG-482: rotate session tokens")).toEqual(["ENG-482"]);
  });

  it("finds keys across several inputs, without duplicates", () => {
    expect(findIssueKeys("ENG-482 fix", "feature/eng-482-tokens").sort())
      .toEqual(["ENG-482"]);
  });

  it("uppercases a branch-style key", () => {
    expect(findIssueKeys("feature/plat-7-retry")).toEqual(["PLAT-7"]);
  });

  it("finds more than one", () => {
    expect(findIssueKeys("ENG-1 and OPS-22").sort()).toEqual(["ENG-1", "OPS-22"]);
  });

  it("ignores a single leading letter", () => {
    // "A-1" is far more likely to be prose than an issue.
    expect(findIssueKeys("option A-1 is better")).toEqual([]);
  });

  it("matches a shape it cannot tell from a real key", () => {
    // "SHA-256" is indistinguishable from project SHA, issue 256 — there is
    // no signal that separates them, and the cost of being wrong is one
    // lookup that 404s. Worth recording as accepted rather than fixed.
    expect(findIssueKeys("SHA-256 hashing")).toEqual(["SHA-256"]);
    // Likewise: XENG is as plausible a project as ENG.
    expect(findIssueKeys("xENG-482")).toEqual(["XENG-482"]);
  });

  it("does not match a key glued to a digit", () => {
    // No word boundary, so this is one token rather than a key.
    expect(findIssueKeys("1ENG-482")).toEqual([]);
  });

  it("ignores a key with no digits", () => {
    expect(findIssueKeys("ENG-")).toEqual([]);
  });

  it("returns nothing for a title that names none", () => {
    expect(findIssueKeys("Bump dependencies")).toEqual([]);
  });

  it("handles an empty or missing input", () => {
    expect(findIssueKeys("", undefined as unknown as string)).toEqual([]);
  });
});
