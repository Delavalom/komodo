/**
 * What a container orchestrator probes.
 *
 * Docker and Railway had nothing to ask this deployment before: the queue's
 * routes all render the app shell, which loads a snapshot and would report a
 * database outage as a 500 on a page a human was reading. This answers the
 * same question in one cheap query, and says enough to tell the two failure
 * modes apart — a store that will not open, and a poller that has stopped
 * polling while the web half stays up.
 *
 * Unauthenticated by design; it exposes no review content.
 */
import { NextResponse } from "next/server";

import { META_LAST_POLL_AT, META_LAST_POLL_ERROR } from "@komodo/store";

import { getStore } from "@/lib/data/server";

/** Never cached: a health check that answers from a cache is not one. */
export const dynamic = "force-dynamic";

/**
 * How stale the poll heartbeat may be before this reports degraded.
 *
 * `komodo serve` polls every 60s by default and the container every 300s, so
 * this has to clear the slowest of those with room for one missed pass. It is
 * deliberately not derived from the configured interval: the web process does
 * not own that number, and guessing wrong would flap.
 */
const POLL_STALE_MS = 15 * 60 * 1000;

export async function GET() {
  let store;
  try {
    store = await getStore();
    // Cheapest round trip that proves the connection is real rather than
    // merely constructed — a pool hands back a handle before it has a socket.
    await store.getMeta(META_LAST_POLL_AT);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        db: "unreachable",
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 503 },
    );
  }

  const [rawPollAt, pollError] = await Promise.all([
    store.getMeta(META_LAST_POLL_AT),
    store.getMeta(META_LAST_POLL_ERROR),
  ]);

  // Absent rather than zero: `--no-poll` and a first run before the opening
  // pass both leave this unwritten, and neither is a fault.
  const lastPollAt = rawPollAt ? Number(rawPollAt) : null;
  const pollStale =
    lastPollAt !== null && Date.now() - lastPollAt > POLL_STALE_MS;

  return NextResponse.json({
    ok: true,
    db: "ok",
    lastPollAt,
    pollStale,
    lastPollError: pollError || null,
  });
}
