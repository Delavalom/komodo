/**
 * The PR watcher.
 *
 * Reads new comments on the pull requests a person has opted into watching,
 * and asks Claude whether each is worth their attention — never anything
 * more. Its own cadence, separate from the main poll: the watched set is
 * opt-in and small by construction (unlike every open PR), but a comment
 * fetch still costs three GitHub requests and a triage call is a Claude
 * session, so this runs on a gap measured in minutes, not seconds. See
 * AGENTS.md rule 15 — nothing here holds a GitHubClient reference that can
 * write, and nothing it produces is posted or pushed automatically.
 */
import type { GitHubClient, WatchTriageProvider } from "@komodo/core";
import { META_WATCH_LAST_CHECKED_AT } from "@komodo/store";
import type { KomodoStore } from "@komodo/store";

import type { RepoCheckout } from "./checkout.js";
import { fetchConversation } from "./conversation.js";

/** The default gap between two comment-triage passes over the watched set. */
export const WATCH_INTERVAL_MS = 5 * 60_000;

/** New comments triaged per watch per pass, so one busy thread can't starve the rest. */
const MAX_NEW_PER_WATCH = 5;

export interface WatchPollOptions {
  onProgress?: (msg: string) => void;
  intervalMs?: number;
  checkout?: RepoCheckout;
}

export interface WatchPollResult {
  checked: number;
  eventsRecorded: number;
}

/**
 * One pass over every watch, gated on `WATCH_INTERVAL_MS`.
 *
 * Gated globally rather than per watch, unlike the main poll's per-repository
 * checks cadence: the watched set has no per-repository request budget to
 * protect, since watching is opt-in and the whole point is that it stays
 * small. What this gate protects is simpler — a floor on how often a pass
 * that calls out to Claude runs at all.
 */
export async function pollWatches(
  github: GitHubClient,
  store: KomodoStore,
  triage: WatchTriageProvider,
  options: WatchPollOptions = {},
): Promise<WatchPollResult> {
  const interval = options.intervalMs ?? WATCH_INTERVAL_MS;
  const lastCheckedAt = Number((await store.getMeta(META_WATCH_LAST_CHECKED_AT)) ?? 0);
  if (Date.now() - lastCheckedAt < interval) {
    return { checked: 0, eventsRecorded: 0 };
  }

  const [watches, pullRequests, { repositories }] = await Promise.all([
    store.listPullRequestWatches(),
    store.listPullRequests(),
    store.snapshot(),
  ]);
  const prById = new Map(pullRequests.map((pr) => [pr.id, pr]));
  const repoById = new Map(repositories.map((repo) => [repo.id, repo]));

  let checked = 0;
  let eventsRecorded = 0;

  for (const watch of watches) {
    const pr = prById.get(watch.prId);
    const repo = pr && repoById.get(pr.repoId);
    // A watch on a pull request that has since merged, closed, or whose
    // repository was switched off is left alone rather than deleted — the
    // person who watched it might still want to see what was already
    // triaged, and re-enabling the repo should not require re-watching.
    if (!pr || pr.state !== "open" || !repo || !repo.enabled) continue;

    checked++;
    const ref = { owner: repo.owner, repo: repo.name, number: pr.number };
    try {
      const entries = await fetchConversation(github, ref);
      const since = watch.lastSeenExternalId ?? -1;
      const fresh = entries
        .filter((entry) => entry.externalId > since)
        .slice(0, MAX_NEW_PER_WATCH);
      if (fresh.length === 0) continue;

      const repoDir = await options.checkout?.prepare({
        owner: repo.owner,
        name: repo.name,
        number: pr.number,
      });

      for (const entry of fresh) {
        const result = await triage.triage({
          pr: { title: pr.title, number: pr.number, url: pr.url, author: pr.author },
          comment: {
            author: entry.author,
            body: entry.body,
            path: entry.path,
            line: entry.line,
          },
          repoDir,
          wantDraft: watch.mode === "notify_and_draft",
        });
        await store.recordWatchEvent({
          watchId: watch.id,
          prId: pr.id,
          commentExternalId: entry.externalId,
          commentKind: entry.kind,
          commentAuthor: entry.author,
          commentBody: entry.body,
          commentUrl: entry.url,
          verdict: result.verdict,
          reasoning: result.reasoning,
          draftResponse: result.draftResponse,
          draftPatchSummary: result.draftPatchSummary,
        });
        eventsRecorded++;
      }

      const newest = fresh[fresh.length - 1];
      await store.markWatchChecked(watch.id, newest.externalId, Date.now());
    } catch (err) {
      // One watch that cannot be read or triaged — a repository that went
      // private, a Claude session that failed — must not stop the pass for
      // everyone else's.
      const detail = err instanceof Error ? err.message : String(err);
      options.onProgress?.(
        `  could not check ${repo.owner}/${repo.name}#${pr.number}: ${detail}`,
      );
    }
  }

  await store.setMeta(META_WATCH_LAST_CHECKED_AT, String(Date.now()));
  return { checked, eventsRecorded };
}
