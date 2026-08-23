/**
 * Picking a driver from the environment.
 *
 * The one place that decides, so `komodo dev` and `komodo serve` differ by a
 * connection string rather than by which app they run. A `postgres://` URL
 * means the team deployment; anything else is a file path and the local one.
 */
import type { KomodoStore } from "./port.js";

export function isPostgresUrl(target: string): boolean {
  return /^postgres(ql)?:\/\//.test(target);
}

/**
 * `target` is a Postgres connection string or a SQLite file path.
 *
 * The drivers are imported dynamically so that opening a SQLite store never
 * loads `pg`, and a Postgres deployment never touches node:sqlite.
 */
export async function connectStore(target: string): Promise<KomodoStore> {
  if (isPostgresUrl(target)) {
    const { PostgresStore } = await import("./postgres.js");
    return PostgresStore.connect(target);
  }
  const { SqliteStore } = await import("./sqlite.js");
  return new SqliteStore({ path: target });
}
