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
  const { SqliteStore } = await importSqlite();
  return new SqliteStore({ path: target });
}

/**
 * node:sqlite is why this package declares node >=24, and the CLI that bundles
 * it declares >=22: everything except a SQLite store runs on 22, so refusing
 * to install there would cost `komodo pr` and `komodo prompt` an LTS for a
 * module they never load. The cost is that the failure lands here rather than
 * at install time, so it has to say what to do about it.
 *
 * Only a missing builtin is rewritten. An error thrown while the driver
 * initialises is a different bug, and burying it under advice about Node
 * versions would send whoever hits it in the wrong direction.
 */
async function importSqlite(): Promise<typeof import("./sqlite.js")> {
  try {
    return await import("./sqlite.js");
  } catch (cause) {
    if (!isMissingBuiltin(cause)) throw cause;
    throw new Error(
      `A SQLite store needs node:sqlite, which this Node (${process.version}) ` +
        "does not expose. Use Node 24 or newer, or point DATABASE_URL at a " +
        "postgres:// URL.",
      { cause },
    );
  }
}

function isMissingBuiltin(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code === "ERR_UNKNOWN_BUILTIN_MODULE") return true;
  return typeof message === "string" && message.includes("node:sqlite");
}
