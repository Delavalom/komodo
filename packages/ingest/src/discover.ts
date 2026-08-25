/**
 * What else this team could review.
 *
 * Repositories used to reach the store from exactly one place: komodo.yaml's
 * `team.repos`. That made Manage Repositories a screen showing a list it could
 * not change — every row was already in the file, and adding one meant shell
 * access to the server and a restart. Worse, `autoEnableNewRepos` had a toggle
 * on Repo Settings and no reader anywhere: there were no *new* repositories,
 * because nothing ever looked for any.
 *
 * This looks. It lists what the token can see for each owner the team already
 * watches and writes the ones the store has never heard of. Whether a new row
 * arrives switched on is exactly what that toggle decides — which is the whole
 * difference between a setting and a decoration.
 *
 * When it runs is not its own decision: `discoverIfAsked` in loop.ts calls it
 * only for a team that wants new repositories enabled, or for a Rescan someone
 * pressed. The interval guard below is what keeps the first of those cheap on a
 * sixty-second poll; a Rescan passes `force` straight through it.
 *
 * Two things it deliberately does not do:
 *
 *   - **Touch a repository the store already knows.** `upsertRepository`
 *     overwrites `enabled`, so re-writing an existing row would undo, on the
 *     next pass, whatever someone had just chosen on the screen.
 *   - **Invent owners.** Only owners already represented in the store are
 *     listed. A token that can read fifty organisations does not turn this
 *     deployment into a directory of all fifty.
 */
import type { GitHubClient } from "@komodo/core";
import {
  META_LAST_DISCOVERY_AT,
  META_LAST_DISCOVERY_ERROR,
} from "@komodo/store";
import type { KomodoStore } from "@komodo/store";

export interface DiscoverOptions {
  store: KomodoStore;
  github: GitHubClient;
  /** New repositories arrive enabled. From `settings.autoEnableNewRepos`. */
  autoEnable: boolean;
  /** How stale the last listing may be before this runs again. */
  intervalMs?: number;
  /** Run even if the last listing is recent. The screen's Rescan button. */
  force?: boolean;
  onProgress?: (msg: string) => void;
}

export interface DiscoverResult {
  /** Owners listed this pass. Zero means the interval had not elapsed. */
  owners: number;
  /** Repositories written for the first time. */
  added: number;
  /** Owners the token could not read. The pass still counts as done. */
  failed: string[];
}

/**
 * Fifteen minutes.
 *
 * A poll runs every sixty seconds and a repository is created about as often
 * as a person decides to create one. This is the number that keeps discovery
 * off the poll's budget while still finding a new repository within a coffee
 * break of it existing.
 */
const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;

export async function discoverRepositories(
  options: DiscoverOptions,
): Promise<DiscoverResult> {
  const { store, github, autoEnable, force, onProgress } = options;
  const interval = options.intervalMs ?? DEFAULT_INTERVAL_MS;

  const last = Number((await store.getMeta(META_LAST_DISCOVERY_AT)) ?? 0);
  if (!force && Date.now() - last < interval)
    return { owners: 0, added: 0, failed: [] };

  // Stamped from before the listings rather than after them.
  //
  // `discoverIfAsked` decides a Rescan is outstanding by comparing its request
  // against this timestamp, so a pass that stamped its own *completion* would
  // swallow every request pressed while it was running: such a request is
  // newer than the pass that began before it and older than the timestamp that
  // pass writes when it ends, and the next pass reads it as already served.
  // Watermarking from the start costs the interval guard one pass-duration of
  // earliness and keeps the button honest, which is the better trade for a
  // listing that runs four times an hour.
  const startedAt = Date.now();

  const { repositories } = await store.snapshot();
  const known = new Set(repositories.map((r) => r.id));
  const owners = [...new Set(repositories.map((r) => r.owner))];

  const failed: string[] = [];
  let added = 0;
  for (const owner of owners) {
    let listed;
    try {
      listed = await github.listOwnerRepos(owner);
    } catch (err) {
      // One owner the token has lost access to must not cost the pass its
      // other owners, nor the poll that follows it.
      const detail = err instanceof Error ? err.message : String(err);
      failed.push(`${owner} (${detail})`);
      onProgress?.(`Could not list ${owner}'s repositories: ${detail}`);
      continue;
    }

    for (const repo of listed) {
      if (repo.archived) continue;
      const id = `${repo.owner}/${repo.name}`;
      if (known.has(id)) continue;

      await store.upsertRepository({
        id,
        owner: repo.owner,
        name: repo.name,
        provider: "github",
        enabled: autoEnable,
        reviewCount: 0,
      });
      known.add(id);
      added++;
    }
  }

  // Both written after the listings, so a pass that threw is retried rather
  // than counted as done. An owner that merely 404'd is not that: the pass
  // finished, the request it served is spent, and what it could not see is on
  // the record instead of only in the ingester's log.
  await store.setMeta(META_LAST_DISCOVERY_AT, String(startedAt));
  await store.setMeta(META_LAST_DISCOVERY_ERROR, failed.join(", "));

  if (added) {
    onProgress?.(
      `Discovered ${added} new ${added === 1 ? "repository" : "repositories"}` +
        (autoEnable ? ", enabled." : " — enable them under Manage Repositories."),
    );
  }
  return { owners: owners.length, added, failed };
}
