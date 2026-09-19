import "server-only";

/**
 * A pull request's conversation, read through a cache.
 *
 * Deliberately not polled. The poller sees every open pull request across every
 * watched repository on a one-minute interval, and a conversation costs three
 * GitHub requests each — a hundred open pull requests would be three hundred
 * requests a minute to keep discussions warm that nobody is reading. So it is
 * fetched when somebody actually opens the pull request, and kept for a few
 * minutes after.
 *
 * The cache is a real cache and not a store of record: GitHub owns these rows,
 * `replacePullRequestComments` swaps them wholesale, and an edited or deleted
 * comment there stops existing here on the next read.
 */
import { GitHubClient, resolveGithubToken } from "@komodo/core";
import { fetchConversation } from "@komodo/ingest";
import type { PullRequestConversation } from "@komodo/store";

import { getStore } from "@/lib/data/server";

/**
 * How long a cached conversation is good for.
 *
 * Short, because the reader is looking at it to decide what to say next and a
 * five-minute-old thread can be missing the reply that answers their question.
 * Long enough that clicking between the three views of one review does not pay
 * for three fetches.
 */
const STALE_MS = 3 * 60 * 1000;

/**
 * How long a failed read is remembered before it is retried.
 *
 * Without this a pull request whose repository the token can no longer read
 * spends three GitHub requests and up to a few seconds of retry backoff on
 * every single render, forever, because only a success stamps the cache.
 */
const RETRY_AFTER_FAILURE_MS = 60 * 1000;

/**
 * Reads in flight, keyed on the pull request.
 *
 * Five people opening the same pull request used to be five identical fetches
 * and five wholesale rewrites of the same cache rows — on Postgres, four of
 * them losing to a primary-key conflict and surfacing as a database error in a
 * GitHub-flavoured message. One read, shared.
 */
const inFlight = new Map<string, Promise<ConversationView>>();

/** When each pull request's read last failed, so it is not retried per render. */
const lastFailure = new Map<string, { at: number; error: string }>();

export interface ConversationView {
  conversation: PullRequestConversation | null;
  /**
   * Why there is nothing to show, when there is nothing to show.
   *
   * A missing token and an empty discussion look identical on screen unless the
   * screen is told which it is — and "no comments yet" on a pull request with
   * twelve of them is the kind of quiet wrongness that makes a reader stop
   * trusting the whole page.
   */
  error: string | null;
}

/**
 * The conversation, fetching it first if the cache has nothing fresh.
 *
 * A GitHub failure falls back to whatever was cached rather than to an empty
 * thread: a stale conversation with a timestamp on it is useful, and an empty
 * one is a lie.
 */
export async function loadConversation(
  prId: string,
  options: { force?: boolean; now?: number } = {},
): Promise<ConversationView> {
  const store = await getStore();
  const cached = await store.loadPullRequestConversation(prId);
  const now = options.now ?? Date.now();

  const fresh =
    cached !== null && !options.force && now - cached.observedAt < STALE_MS;
  if (fresh) return { conversation: cached, error: null };

  const ref = parsePrId(prId);
  if (!ref) {
    return { conversation: cached, error: `Not a pull request id: ${prId}` };
  }

  // A recent failure is remembered rather than repeated. Pressing the button
  // is an explicit "try anyway" and skips it.
  const failed = lastFailure.get(prId);
  if (!options.force && failed && now - failed.at < RETRY_AFTER_FAILURE_MS) {
    return { conversation: cached, error: failed.error };
  }

  const running = inFlight.get(prId);
  if (running) return running;

  const read = (async (): Promise<ConversationView> => {
    try {
      const github = new GitHubClient(resolveGithubToken());
      const entries = await fetchConversation(github, ref);
      await store.replacePullRequestComments(prId, entries, now);
      lastFailure.delete(prId);
      return {
        conversation: await store.loadPullRequestConversation(prId),
        error: null,
      };
    } catch (err) {
      // The common one is no token at all, and its message says what to do.
      const error = err instanceof Error ? err.message : String(err);
      lastFailure.set(prId, { at: now, error });
      return { conversation: cached, error };
    } finally {
      inFlight.delete(prId);
    }
  })();

  inFlight.set(prId, read);
  return read;
}

/** `owner/name#number` — the only shape a pull request id ever has. */
export function parsePrId(
  prId: string,
): { owner: string; repo: string; number: number } | null {
  const match = /^([^/]+)\/([^#]+)#(\d+)$/.exec(prId);
  if (!match) return null;
  return { owner: match[1], repo: match[2], number: Number(match[3]) };
}
