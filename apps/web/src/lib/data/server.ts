import "server-only";

/**
 * The read seam's server half.
 *
 * Everything shared loads here, once per request, and is handed to the client
 * as a snapshot. This is the line that makes the queue a team's queue rather
 * than a browser's: the same rows for whoever opens the page.
 *
 * Which driver backs it is an env decision and nothing above this file knows
 * the answer — that is what lets `komodo dev` and `komodo serve` run the same
 * app.
 */
import { seedStore } from "@komodo/store/seed";
import { SqliteStore } from "@komodo/store/sqlite";
import type { KomodoStore, QueueSnapshot } from "@komodo/store";

const DEFAULT_DB = ".komodo/komodo.db";

/**
 * One handle for the process. Next re-executes modules per request in dev, so
 * this hangs off globalThis — otherwise every reload leaks another open
 * database.
 */
const handle = globalThis as typeof globalThis & {
  __komodoStore?: Promise<KomodoStore>;
};

async function connect(): Promise<KomodoStore> {
  const store = new SqliteStore({ path: process.env.KOMODO_DB ?? DEFAULT_DB });

  // An empty database means nobody has run the ingester yet. Seeding it beats
  // opening on an empty table and looking broken.
  const { repositories } = await store.snapshot();
  if (repositories.length === 0) await seedStore(store);

  return store;
}

export function getStore(): Promise<KomodoStore> {
  handle.__komodoStore ??= connect();
  return handle.__komodoStore;
}

export async function loadSnapshot(): Promise<QueueSnapshot> {
  return (await getStore()).snapshot();
}
