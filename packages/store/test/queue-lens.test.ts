/**
 * What "Needs my review" contains.
 *
 * The reported bug is the first case here: a five-person roster, twenty-two
 * open pull requests, and a tab reading zero — because the lens asked only
 * whether the *author* was on the roster, and said nothing about GitHub having
 * asked you by name.
 */
import { describe, expect, it } from "vitest";

import { needsReviewFrom } from "../src/queue-lens.js";
import type { PullRequest } from "../src/types.js";

const ROSTER = new Set(["kai", "marco", "renata"]);

const pr = (over: Partial<PullRequest> = {}): PullRequest => ({
  id: "acme/api#1",
  repoId: "acme/api",
  number: 1,
  title: "Add rate limiting",
  author: "marco",
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
  checks: null,
  ...over,
});

const viewer = (login: string | null, teammateLogins = ROSTER) => ({
  login,
  teammateLogins,
});

describe("needsReviewFrom", () => {
  it("includes a teammate's pull request", () => {
    expect(needsReviewFrom(pr(), viewer("renata"))).toBe(true);
  });

  it("includes one GitHub asked me to review, whoever wrote it", () => {
    // The 22-open, 0-mine case: an author outside the roster, and a review
    // request naming me. GitHub's own tab shows this; Komodo's did not.
    const asked = pr({ author: "outsider", requestedReviewers: ["renata"] });
    expect(needsReviewFrom(asked, viewer("renata"))).toBe(true);
  });

  it("matches a review request regardless of case", () => {
    const asked = pr({ author: "outsider", requestedReviewers: ["Renata"] });
    expect(needsReviewFrom(asked, viewer("renata"))).toBe(true);
  });

  it("excludes a stranger's pull request nobody asked me about", () => {
    expect(needsReviewFrom(pr({ author: "outsider" }), viewer("renata"))).toBe(
      false,
    );
  });

  it("excludes my own pull request, even when I am a requested reviewer", () => {
    const mine = pr({ author: "renata", requestedReviewers: ["renata"] });
    expect(needsReviewFrom(mine, viewer("renata"))).toBe(false);
  });

  it("drops out once I have approved or requested changes", () => {
    expect(needsReviewFrom(pr({ approvals: ["renata"] }), viewer("renata"))).toBe(
      false,
    );
    expect(
      needsReviewFrom(pr({ changesRequested: ["Renata"] }), viewer("renata")),
    ).toBe(false);
  });

  it("is empty when nobody is marked as you", () => {
    // Not "nothing is waiting on you": the deployment cannot say who you are,
    // which is a different sentence and a different fix.
    expect(needsReviewFrom(pr(), viewer(null))).toBe(false);
    expect(
      needsReviewFrom(pr({ requestedReviewers: ["renata"] }), viewer(null)),
    ).toBe(false);
  });

  it("still finds an explicit request when the roster is only me", () => {
    const asked = pr({ author: "outsider", requestedReviewers: ["renata"] });
    expect(needsReviewFrom(asked, viewer("renata", new Set(["renata"])))).toBe(
      true,
    );
  });
});
