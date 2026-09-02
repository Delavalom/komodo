/**
 * Which pull requests are worth a review at all.
 *
 * These rules used to live in the worker, and ran after a durable job had
 * already been created and claimed. A repository whose roster covers five of
 * fifty authors therefore paid a job row, a lease, a skipped judgment and a
 * line of output for every pull request it was always going to pass over —
 * once per pull request, and again for each new head. The decision belongs
 * where the work is created, so it is here, and `poll.ts` asks before it
 * enqueues.
 *
 * The split matters. `automaticEligibility` answers "should Komodo start this
 * on its own", which is a question about noise and quota. `hardLimits` answers
 * "can this be reviewed at all", which no request can wave away. A person who
 * clicks Review with AI has overridden the first and cannot override the
 * second — see `reviewPending` in review.ts.
 *
 * The reason is returned rather than a boolean so the queue and the log can say
 * what happened. A pull request nobody reviewed and nobody explained is
 * indistinguishable, to the person waiting on it, from one Komodo lost.
 */
import type { KomodoConfig } from "@komodo/core";
import type { PullRequest } from "@komodo/store";

export type Eligibility = { skip: false } | { skip: true; reason: string };

/**
 * Only the fields an eligibility rule reads.
 *
 * Narrower than PullRequest because the caller is the poller, which is holding
 * a row it is about to write rather than one the store has handed back — and a
 * stored pull request carries observations (a check rollup) that the listing
 * pass has not made and this decision does not use.
 */
export type EligibilityCandidate = Pick<
  PullRequest,
  "isDraft" | "title" | "author" | "changedFiles"
>;

/** The rules a request cannot override: a review that cannot be run well. */
export function hardLimits(
  pr: EligibilityCandidate,
  config: KomodoConfig,
): Eligibility {
  // 0 disables the cap. A pull request that rewrites a lockfile or vendors a
  // dependency is not a review a subscription should pay for.
  const { max_files } = config.auto_review;
  if (max_files > 0 && pr.changedFiles > max_files) {
    return {
      skip: true,
      reason: `${pr.changedFiles} files changed, over the ${max_files} limit`,
    };
  }
  return { skip: false };
}

/**
 * The rules for work Komodo starts by itself.
 *
 * Drafts, WIP titles and off-roster authors are all the same judgement — this
 * one is not worth a model run unless someone says otherwise — and every one of
 * them is a setting, because whose pull requests matter is not Komodo's call.
 */
export function automaticEligibility(
  pr: EligibilityCandidate,
  config: KomodoConfig,
): Eligibility {
  const { auto_review } = config;

  if (pr.isDraft && !auto_review.drafts) {
    return { skip: true, reason: "draft" };
  }

  const title = pr.title.toLowerCase();
  const keyword = auto_review.ignore_title_keywords.find(
    (word) => word.trim() && title.includes(word.toLowerCase()),
  );
  if (keyword) {
    return { skip: true, reason: `title contains "${keyword}"` };
  }

  const { mode, tokens } = auto_review.authors;
  if (tokens.length) {
    // Case-insensitive: GitHub logins are, and a roster typed by hand will
    // not match one that was copied out of the API.
    const listed = tokens.some(
      (t) => t.toLowerCase() === pr.author.toLowerCase(),
    );
    if (mode === "exclude" && listed) {
      return { skip: true, reason: `author ${pr.author} is filtered out` };
    }
    if (mode === "include" && !listed) {
      return {
        skip: true,
        reason: `author ${pr.author} is not on the review list`,
      };
    }
  }

  return hardLimits(pr, config);
}

/**
 * Both sets at once.
 *
 * Kept because it is the whole rule in one name, and because a caller that
 * wants "would Komodo have reviewed this by itself" should not have to know
 * that the answer is two functions.
 */
export function shouldReview(
  pr: PullRequest,
  config: KomodoConfig,
): Eligibility {
  return automaticEligibility(pr, config);
}
