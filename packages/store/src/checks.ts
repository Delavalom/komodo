/**
 * When a stored check rollup still describes the pull request.
 *
 * A rollup is pinned to the commit it was read from, and a pull request's head
 * moves. Between a push and the next poll the row therefore holds a rollup for
 * a commit that is no longer what would merge — and the one thing this column
 * must never do is show a green build for code nobody has built. So the first
 * rule is: a rollup that does not name the current head is not information.
 *
 * The second rule is age. A repository can stop being readable — renamed, gone
 * private, a scope dropped, the GraphQL budget spent — and when it does the
 * poller writes nothing rather than writing a wrong answer. That is right, and
 * it has a consequence: the last observation stays on screen, against a head
 * that has not moved, for as long as the repository stays unreadable. Monday's
 * green pill on Friday's queue is exactly the lie the first rule exists to
 * prevent, arriving by a different road.
 *
 * It lives here rather than in either driver because a rule that decides
 * whether a build looks green is exactly the kind that must not be able to
 * differ between SQLite and Postgres.
 */
import type { ChecksState, PullRequestChecks } from "./types.js";

/**
 * How long an observation describes the present.
 *
 * Generously longer than any sane poll interval, because expiring a rollup the
 * poller is still refreshing would blank the column on every slow pass. Short
 * enough that a repository which stopped being readable goes quiet within a
 * day rather than lying indefinitely.
 */
export const CHECKS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** The stored columns, already coerced out of whatever the driver returned. */
export interface StoredChecks {
  headSha: string;
  checksHeadSha: string | null;
  checksState: string | null;
  checksPassed: number | null;
  checksPending: number | null;
  checksFailing: string[];
  checksObservedAt: number | null;
}

const STATES: ChecksState[] = ["passing", "failing", "pending", "neutral"];

export function readChecks(
  stored: StoredChecks,
  now: number = Date.now(),
): PullRequestChecks | null {
  // No observation, or one written before this column existed.
  if (stored.checksObservedAt === null || stored.checksHeadSha === null) return null;
  // Read from a commit this pull request has moved past.
  if (stored.checksHeadSha !== stored.headSha) return null;
  // Old enough that nobody should be deciding anything on it.
  if (now - stored.checksObservedAt > CHECKS_MAX_AGE_MS) return null;
  // A value the vocabulary does not contain is a bug or a downgrade, and
  // guessing which state it meant is worse than admitting nothing is known.
  if (!STATES.includes(stored.checksState as ChecksState)) return null;

  // `failed` is counted from the names rather than stored: every failing check
  // contributes exactly one, so a column for it would be a second copy of a
  // number the row already holds — and two copies of a number drift.
  const failing = stored.checksFailing;
  const passed = stored.checksPassed;
  const pending = stored.checksPending;

  return {
    headSha: stored.checksHeadSha,
    state: stored.checksState as ChecksState,
    failing,
    // Null all the way through when the detail was never fetched: a screen
    // showing "0 checks" for a commit nobody counted is inventing a number.
    total: passed === null || pending === null ? null : passed + pending + failing.length,
    passed,
    pending,
    observedAt: stored.checksObservedAt,
  };
}
