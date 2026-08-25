/**
 * Whether a pull request is waiting on one particular person.
 *
 * "Needs my review" is the tab the queue opens on, and it was answering a
 * narrower question than its name: the author had to be on the roster, so a
 * repository whose authors sit outside the team showed zero even when GitHub
 * had named you a reviewer by hand. Either half alone is wrong — a
 * request-only lens hides the team-level and informal assignments that are most
 * of how review gets asked for — so this is the union of the two.
 *
 * The rule lives here rather than in the web app for the same reason
 * `pickActor` does: it is a fact about a roster and an observation of GitHub,
 * not about a request. Keeping it out of a React hook is also what makes it
 * testable — the app has no test harness, and the tab being silently empty is
 * exactly the failure a test is for.
 */
import type { PullRequest } from "./types.js";

export interface QueueLensViewer {
  /** The viewer's GitHub login, or null when nobody is marked as "you". */
  login: string | null;
  /** Every roster login, lowercased. */
  teammateLogins: ReadonlySet<string>;
}

export function needsReviewFrom(
  pr: PullRequest,
  viewer: QueueLensViewer,
): boolean {
  // Nobody is marked as you: no pull request can be matched to a person the
  // deployment cannot name, and the lens is empty for a reason the screen has
  // to say out loud rather than call "nothing is waiting on you".
  const me = viewer.login?.toLowerCase() ?? null;
  if (me === null) return false;

  const author = pr.author.toLowerCase();
  // Your own pull request is never waiting on you.
  if (author === me) return false;

  const asked =
    viewer.teammateLogins.has(author) ||
    pr.requestedReviewers.some((reviewer) => reviewer.toLowerCase() === me);
  if (!asked) return false;

  // Once I approve or request changes the ball is back in the author's court,
  // for this observed review state — a new push moves it back to me.
  return (
    !pr.approvals.some((reviewer) => reviewer.toLowerCase() === me) &&
    !pr.changesRequested.some((reviewer) => reviewer.toLowerCase() === me)
  );
}
