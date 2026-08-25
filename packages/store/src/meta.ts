/**
 * Keys for the `meta` table.
 *
 * Constants rather than literals at each call site because the writer is in
 * @komodo/ingest and the reader is in the web app's health route — two
 * packages that never import each other, and a typo between them would
 * produce a health check that is permanently, silently stale.
 */

/** Epoch milliseconds at which the poller last completed a pass. */
export const META_LAST_POLL_AT = "lastPollAt";

/**
 * Why the last pass failed, or absent if it succeeded. Cleared on success, so
 * its presence means the most recent pass is the one that broke.
 */
export const META_LAST_POLL_ERROR = "lastPollError";

/**
 * Set once komodo.yaml's review settings have been adopted into the store.
 *
 * A marker rather than "does a settings row exist": a team that saved the
 * defaults has a row indistinguishable from no row, and re-seeding from the
 * file would quietly undo what they chose.
 */
export const META_SETTINGS_INITIALIZED = "settingsInitialized";

/**
 * Epoch milliseconds at which repository discovery last listed an owner.
 *
 * Discovery answers "what else could this team review", which changes on the
 * timescale of someone creating a repository — not on the poll interval. The
 * timestamp is what keeps a 60-second poll from spending a listing per owner
 * every minute for an answer that is the same all day.
 */
export const META_LAST_DISCOVERY_AT = "lastDiscoveryAt";

/**
 * Epoch milliseconds at which someone asked for the repository listing.
 *
 * Discovery is on demand: a 735-repository organisation is eight pages of REST
 * per owner for an answer that changes weekly, and it fills Manage Repositories
 * with hundreds of rows nobody asked for. So the ingester lists an owner only
 * when this is newer than META_LAST_DISCOVERY_AT — or when new repositories are
 * set to arrive enabled, which is a team saying they want them found.
 *
 * A request rather than clearing the heartbeat, which is what the Rescan button
 * used to do: "when did we last look" is a fact the screen shows, and answering
 * "never" every time someone presses a button is a lie about the past.
 */
export const META_DISCOVERY_REQUESTED_AT = "discoveryRequestedAt";
