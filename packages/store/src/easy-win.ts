/**
 * Which open pull request is the cheapest one to finish right now.
 *
 * The queue already answers "what is waiting on me" and "what has gone stale".
 * Neither answers the question people actually ask on a Friday afternoon,
 * which is "is there anything here I could just clear". That is not the same
 * as small: a two-line change with a red build and a blocking concern is not a
 * quick win, and a three-hundred-line refactor with green checks, a ready brief
 * and nothing outstanding often is.
 *
 * Two parts, and the order matters. Some facts disqualify a pull request
 * outright — there is no such thing as an easy review of a draft, or of a
 * branch whose build is broken, because the work is not finished and the
 * reviewer would only be sending it back. Everything else is a weighting, and
 * the score exists to sort rows against each other rather than to be a number
 * anybody reads.
 *
 * Nothing here is stored. It is computed from the rows that cause it, on every
 * read, for the same reason the engagement counts are — a stored "easy" flag
 * and the pull request it describes drift apart the moment somebody pushes.
 *
 * It lives beside `needsReviewFrom` rather than in a React hook for the same
 * reason that one does: it is a rule about pull requests, not about a request,
 * and the app has no test harness.
 */
import type { PullRequestChecks } from "./types.js";

/** What the ranking reads. Everything here is observed, nothing is opinion. */
export interface EasyWinInput {
  isDraft: boolean;
  /** Null when no rollup has been observed for the current head. */
  checks: PullRequestChecks | null;
  /** Logins who have asked for changes and not withdrawn it. */
  changesRequested: string[];
  changedLines: number;
  changedFiles: number;
  /** Open concerns the AI brief raised on this head. */
  concerns: number;
  /** Whether a brief exists for the current head at all. */
  briefReady: boolean;
}

/**
 * Why a pull request is on the list.
 *
 * Keys rather than sentences: the wording belongs to the screen, and a store
 * package that hands the UI its copy is a store package deciding what the
 * product says.
 */
export type EasyWinSignal =
  | "small"
  | "few_files"
  | "checks_green"
  | "brief_ready"
  | "no_concerns";

export interface EasyWin {
  /** 0–1, for ordering rows against each other. Never shown as a figure. */
  score: number;
  signals: EasyWinSignal[];
}

/** Under this many changed lines is a review somebody can hold in their head. */
const SMALL_LINES = 60;
const MEDIUM_LINES = 200;
const LARGE_LINES = 500;

const FEW_FILES = 4;
const SOME_FILES = 12;

/**
 * The ranking, or null when this is not a quick win at all.
 *
 * Null is a real answer and not a zero: a disqualified pull request should be
 * absent from the lens, not sorted to the bottom of it, because a list that
 * ends in the things it is telling you to avoid is a list nobody trusts.
 *
 * The gates are deliberately strict, and they got stricter after a first
 * version admitted a quarter of its own rows on faith: a pull request whose
 * build nobody had read, and one whose AI brief had crashed, both scored well
 * because neither had anything recorded against it. An absence of bad news is
 * not good news, and a lens that cannot tell the difference is worse than no
 * lens — someone opens the top row, finds a red build and an unanswered
 * question, and never opens the tab again.
 */
export function easyWin(input: EasyWinInput): EasyWin | null {
  // Not finished. Reviewing it is a favour, not a win.
  if (input.isDraft) return null;
  // Somebody already sent it back; the ball is with the author.
  if (input.changesRequested.length > 0) return null;
  // The brief found something a human has to settle. That is the opposite of
  // this list — it is exactly the review that will take a while.
  if (input.concerns > 0) return null;

  // Green, and observed. Not "not failing": a rollup nobody has read, a build
  // still running, and a repository with no CI are three different unknowns,
  // and none of them is a passing build. The lens is labelled "green checks",
  // and a lens that puts unverified rows under that label is one nobody will
  // trust after the first time they open one.
  if (input.checks?.state !== "passing") return null;

  // Nothing has looked at this yet, so "no concerns" is an absence rather than
  // a finding — and a brief that failed or was skipped leaves exactly the same
  // absence. Either way this is not a pull request Komodo can say anything
  // about, which is a poor thing to recommend as the easy one.
  if (!input.briefReady) return null;

  const signals: EasyWinSignal[] = ["checks_green", "brief_ready", "no_concerns"];
  // Everything past the gates is a weighting, and only orders rows against
  // each other. A large change with nothing outstanding is still often the
  // quicker review, so size lowers the rank rather than excluding the row.
  let score = 0.5;

  if (input.changedLines <= SMALL_LINES) {
    score += 0.3;
    signals.push("small");
  } else if (input.changedLines <= MEDIUM_LINES) {
    score += 0.18;
  } else if (input.changedLines <= LARGE_LINES) {
    score += 0.06;
  }

  if (input.changedFiles <= FEW_FILES) {
    score += 0.2;
    signals.push("few_files");
  } else if (input.changedFiles <= SOME_FILES) {
    score += 0.1;
  }

  return { score: Math.min(1, Number(score.toFixed(3))), signals };
}
