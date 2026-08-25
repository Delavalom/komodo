/**
 * The long-running half.
 *
 * Poll, review what that turned up, sleep, repeat — until the caller's signal
 * aborts. Nothing is held across iterations except the connections: the work
 * list is recomputed from the store every pass, so a crash, a deploy or a
 * `komodo serve` restart resumes without bookkeeping.
 */
import type { GitHubClient, KomodoConfig, ReviewProvider } from "@komodo/core";
import {
  META_DISCOVERY_REQUESTED_AT,
  META_LAST_DISCOVERY_AT,
  META_LAST_POLL_AT,
  META_LAST_POLL_ERROR,
} from "@komodo/store";
import type { KomodoStore } from "@komodo/store";

import type { RepoCheckout } from "./checkout.js";
import { discoverRepositories } from "./discover.js";
import { pollRepositories } from "./poll.js";
import { applySettings } from "./settings.js";
import { reviewPending } from "./review.js";

export interface IngestOptions {
  store: KomodoStore;
  github: GitHubClient;
  /** Omit to poll only — useful before a provider is configured. */
  provider?: ReviewProvider;
  /**
   * komodo.yaml as parsed. Each pass overlays the team's stored settings on
   * top of this — see ./settings.ts for which fields each side owns.
   */
  config: KomodoConfig;
  /** Milliseconds between passes. */
  intervalMs?: number;
  post?: boolean;
  /** Gives the reviewer a tree to read. Omit to review diffs alone. */
  checkout?: RepoCheckout;
  signal?: AbortSignal;
  onProgress?: (msg: string) => void;
}

const DEFAULT_INTERVAL_MS = 60_000;

/** One poll-and-review pass. Exported so a CLI can run it exactly once. */
export async function ingestOnce(options: IngestOptions): Promise<void> {
  const { store, github, provider, onProgress } = options;

  // Re-read every pass rather than once at boot. The settings screen writes to
  // the store, and a team that raises the severity threshold should see the
  // next poll honour it — not have to get someone to restart the service.
  const settings = await store.loadSettings();
  const config = applySettings(options.config, settings);

  // Before the poll, not after: a repository discovered and auto-enabled this
  // pass gets its pull requests in the same pass, rather than looking empty
  // until the next one.
  await discoverIfAsked(options, settings.autoEnableNewRepos);

  // `config` as well as `settings`: the poller decides what to enqueue, and the
  // filters that decision needs — drafts, title keywords, the author list, the
  // file cap — are config fields the settings screen writes through.
  const polled = await pollRepositories(github, store, {
    onProgress,
    settings,
    config,
  });
  onProgress?.(
    `Polled ${polled.seen} open PRs — ${polled.changed} changed, ${polled.closed} closed` +
      (polled.notEligible
        ? `, ${polled.notEligible} not eligible for automatic review`
        : "") +
      (polled.unreachable ? `, ${polled.unreachable} unreachable` : "") +
      ".",
  );

  if (!provider) {
    onProgress?.("No review provider configured; polling only.");
    return;
  }

  await reviewPending({
    store,
    github,
    provider,
    // The effective config, not options.config — this is what carries the
    // team's settings into shouldReview() and into the prompt.
    config,
    post: options.post,
    checkout: options.checkout,
    onProgress,
  });
}

/**
 * Lists an owner's repositories, but only when someone wants that.
 *
 * It used to run every pass, unconditionally. Against an organisation with 735
 * repositories that is eight pages of REST per minute, and 735 rows in Manage
 * Repositories that nobody asked for — for an answer that changes about as
 * often as somebody creates a repository. Two things ask for it:
 *
 *   - `autoEnableNewRepos`, which says new repositories should start polled.
 *     A team that turned that on has said they want them found; discovery's own
 *     interval guard keeps the cost to one listing per owner per fifteen
 *     minutes.
 *   - The Rescan button, which writes META_DISCOVERY_REQUESTED_AT. Forced,
 *     because a person pressing a button has already decided the last listing
 *     is stale, and made of two timestamps rather than a flag so a request that
 *     is served is self-clearing — no second write, and no rescan replayed by
 *     a restart.
 *
 * The comparison below is only as good as what discovery stamps, which is why
 * it stamps the moment its listings *began*: a request pressed during a pass
 * has to outlive that pass, or the button does nothing and says nothing.
 */
async function discoverIfAsked(
  options: IngestOptions,
  autoEnable: boolean,
): Promise<void> {
  const { store, github, onProgress } = options;
  const [requestedAt, lastAt] = await Promise.all([
    store.getMeta(META_DISCOVERY_REQUESTED_AT),
    store.getMeta(META_LAST_DISCOVERY_AT),
  ]);
  const requested = Number(requestedAt ?? 0) > Number(lastAt ?? 0);
  if (!requested && !autoEnable) return;

  await discoverRepositories({
    store,
    github,
    autoEnable,
    force: requested,
    onProgress,
  });
}

export async function runIngestLoop(options: IngestOptions): Promise<void> {
  const interval = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const { signal, onProgress } = options;

  while (!signal?.aborted) {
    try {
      await ingestOnce(options);
      // The heartbeat the health endpoint reads. Written after the pass
      // rather than before it, so "last poll" means a poll that finished.
      await recordPass(options.store, null);
    } catch (err) {
      // One bad pass — a network blip, an expired token — must not take the
      // service down. The next pass recomputes everything from the store.
      const message = err instanceof Error ? err.message : String(err);
      onProgress?.(`Ingest pass failed: ${message}`);
      await recordPass(options.store, message);
    }
    if (signal?.aborted) break;
    await sleep(interval, signal);
  }
}

/**
 * Leaves a trace of the pass for the health endpoint.
 *
 * Best effort on purpose: if the store is the thing that just broke, failing
 * to write down that it broke must not turn one bad pass into a crash loop.
 */
async function recordPass(
  store: KomodoStore,
  error: string | null,
): Promise<void> {
  try {
    await store.setMeta(META_LAST_POLL_AT, String(Date.now()));
    await store.setMeta(META_LAST_POLL_ERROR, error ?? "");
  } catch {
    // Nothing useful to do here, and the next pass will try again.
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }
  });
}
