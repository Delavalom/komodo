/**
 * The long-running half.
 *
 * Poll, review what that turned up, sleep, repeat — until the caller's signal
 * aborts. Nothing is held across iterations except the connections: the work
 * list is recomputed from the store every pass, so a crash, a deploy or a
 * `komodo serve` restart resumes without bookkeeping.
 */
import type { GitHubClient, KomodoConfig, ReviewProvider } from "@komodo/core";
import type { KomodoStore } from "@komodo/store";

import { pollRepositories } from "./poll.js";
import { reviewPending } from "./review.js";

export interface IngestOptions {
  store: KomodoStore;
  github: GitHubClient;
  /** Omit to poll only — useful before a provider is configured. */
  provider?: ReviewProvider;
  config: KomodoConfig;
  /** Milliseconds between passes. */
  intervalMs?: number;
  post?: boolean;
  signal?: AbortSignal;
  onProgress?: (msg: string) => void;
}

const DEFAULT_INTERVAL_MS = 60_000;

/** One poll-and-review pass. Exported so a CLI can run it exactly once. */
export async function ingestOnce(options: IngestOptions): Promise<void> {
  const { store, github, provider, config, onProgress } = options;

  const polled = await pollRepositories(github, store, { onProgress });
  onProgress?.(
    `Polled ${polled.seen} open PRs — ${polled.changed} changed, ${polled.closed} closed.`,
  );

  if (!provider) {
    onProgress?.("No review provider configured; polling only.");
    return;
  }

  await reviewPending({
    store,
    github,
    provider,
    config,
    post: options.post,
    onProgress,
  });
}

export async function runIngestLoop(options: IngestOptions): Promise<void> {
  const interval = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const { signal, onProgress } = options;

  while (!signal?.aborted) {
    try {
      await ingestOnce(options);
    } catch (err) {
      // One bad pass — a network blip, an expired token — must not take the
      // service down. The next pass recomputes everything from the store.
      const message = err instanceof Error ? err.message : String(err);
      onProgress?.(`Ingest pass failed: ${message}`);
    }
    if (signal?.aborted) break;
    await sleep(interval, signal);
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
