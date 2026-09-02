/**
 * What belongs on the "easy wins" lens, and — more importantly — what does not.
 *
 * The failure mode this guards against is a list that recommends work which is
 * not actually quick, because that is the one way the lens becomes worse than
 * having no lens: somebody picks the top row, finds a broken build and an
 * unanswered concern, and stops trusting the column.
 */
import { describe, expect, it } from "vitest";

import { easyWin, type EasyWinInput } from "../src/easy-win.js";
import type { PullRequestChecks } from "../src/types.js";

const checks = (over: Partial<PullRequestChecks> = {}): PullRequestChecks => ({
  headSha: "aaa111",
  state: "passing",
  failing: [],
  total: 3,
  passed: 3,
  pending: 0,
  observedAt: 0,
  ...over,
});

const pr = (over: Partial<EasyWinInput> = {}): EasyWinInput => ({
  isDraft: false,
  checks: checks(),
  changesRequested: [],
  changedLines: 20,
  changedFiles: 2,
  concerns: 0,
  briefReady: true,
  ...over,
});

describe("easy wins", () => {
  it("ranks a small, green, already-briefed change highest", () => {
    const win = easyWin(pr());
    expect(win).not.toBeNull();
    expect(win!.score).toBeGreaterThan(0.9);
    expect(win!.signals).toContain("small");
    expect(win!.signals).toContain("checks_green");
    expect(win!.signals).toContain("brief_ready");
  });

  it("excludes a draft rather than ranking it last", () => {
    // A list that ends in the things it is telling you to avoid is a list
    // nobody reads to the bottom of.
    expect(easyWin(pr({ isDraft: true }))).toBeNull();
  });

  it("excludes a pull request somebody has already sent back", () => {
    expect(easyWin(pr({ changesRequested: ["kai"] }))).toBeNull();
  });

  it("excludes a broken build, however small the change", () => {
    expect(
      easyWin(pr({ changedLines: 2, checks: checks({ state: "failing", failing: ["build"] }) })),
    ).toBeNull();
  });

  it("excludes anything with an open concern from the brief", () => {
    // This is the review that will take a while, by definition.
    expect(easyWin(pr({ concerns: 1 }))).toBeNull();
  });

  it("excludes a build still running — it has not passed yet", () => {
    expect(easyWin(pr({ checks: checks({ state: "pending", passed: 1, pending: 2 }) }))).toBeNull();
  });

  it("excludes a repository with no CI, which is not a repository that passed", () => {
    expect(
      easyWin(pr({ checks: checks({ state: "neutral", total: 0, passed: 0 }) })),
    ).toBeNull();
  });

  it("excludes a pull request whose checks nobody has read", () => {
    // The lens is labelled "green checks". A rollup that was never fetched —
    // because the token lost access, or the repository is past the page cap —
    // is an unknown, and an unknown under that label is a promise broken.
    expect(easyWin(pr({ checks: null }))).toBeNull();
  });

  it("excludes a pull request whose brief never ran", () => {
    // A brief that failed or was skipped leaves exactly the same absence as
    // one that has not started: no concerns, because nothing looked.
    expect(easyWin(pr({ briefReady: false }))).toBeNull();
  });

  it("still admits a large change when everything else is settled", () => {
    // Small is a weighting, not a gate. A three-hundred-line change with green
    // checks and nothing outstanding is often the quicker review.
    const large = easyWin(pr({ changedLines: 320, changedFiles: 9 }));
    expect(large).not.toBeNull();
    expect(large!.signals).not.toContain("small");
    expect(large!.score).toBeLessThan(easyWin(pr())!.score);
  });

  it("ranks a small green change above a large one", () => {
    expect(easyWin(pr())!.score).toBeGreaterThan(
      easyWin(pr({ changedLines: 900, changedFiles: 40 }))!.score,
    );
  });

  it("only ever claims there are no concerns about a brief that ran", () => {
    // Every row on this list has been through a completed brief, so the signal
    // is always earned — the case it must never describe is the one now
    // excluded outright.
    for (const row of [pr(), pr({ changedLines: 900, changedFiles: 40 })]) {
      expect(easyWin(row)!.signals).toContain("no_concerns");
    }
  });

  it("keeps the score inside its range", () => {
    const best = easyWin(pr({ changedLines: 1, changedFiles: 1 }));
    expect(best!.score).toBeLessThanOrEqual(1);
    expect(best!.score).toBeGreaterThan(0);
  });
});
