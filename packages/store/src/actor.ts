/**
 * Which member of the roster is acting.
 *
 * Komodo has no authentication — a self-hosted deployment is a trusted
 * network. But "no authentication" was being read as "one identity": every
 * answer and vote was attributed to komodo.yaml's `team.you`, so a shared
 * deployment's decision ledger recorded that one person had decided
 * everything. The ledger is what this product exists to keep, and one that
 * cannot say who decided is not much of a record.
 *
 * The rule lives here rather than in the web app because it is a fact about a
 * roster, not about a request: the caller supplies whatever login it has —
 * from a cookie today, from a session when there is one — and this says which
 * member that is.
 */
import type { Member } from "./types.js";

export function pickActor(
  members: Member[],
  login: string | undefined,
): Member | null {
  // Validated against the roster rather than trusted: the login is a string a
  // person can type, and an unrecognised one would put a name in the ledger
  // that matches no member and no pull request author.
  const chosen = login?.trim()
    ? members.find(
        (m) => m.githubLogin.toLowerCase() === login.trim().toLowerCase(),
      )
    : undefined;

  // Falling back to `team.you` keeps a one-person install from ever having to
  // choose, and a stale login from silently becoming nobody.
  return chosen ?? members.find((m) => m.isYou) ?? members[0] ?? null;
}
