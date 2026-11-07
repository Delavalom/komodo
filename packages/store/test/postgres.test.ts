/**
 * The Postgres driver against the same suite the SQLite one runs.
 *
 * PGlite is real Postgres compiled to WASM, so this executes the driver's
 * actual SQL — placeholders, JSONB, BIGINT coercion and all — with no server
 * to start. Two drivers that pass the same tests are the only thing keeping
 * `komodo dev` and `komodo serve` honest with each other.
 */
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll } from "vitest";

import { PostgresStore } from "../src/postgres.js";
import type { SqlClient } from "../src/sql-client.js";
import { describeStore } from "./conformance.js";

function fromPGlite(db: PGlite): SqlClient {
  return {
    async query<T>(text: string, params?: unknown[]) {
      const result = await db.query(text, params as never[]);
      return { rows: result.rows as T[] };
    },
    exec: async (text: string) => {
      await db.exec(text);
    },
    // Each test's `store.close()` must not tear down the instance every
    // other test in this file still shares; only the afterAll hook below
    // closes the real, shared PGlite.
    close: async () => {},
  };
}

let shared: PGlite;

beforeAll(async () => {
  shared = new PGlite();
  await shared.waitReady;
}, 30_000); // PGlite compiles Postgres to WASM — see conformance.ts's own beforeEach comment; this is the one-time version of the same cold start, now paid once per file instead of once per test.

afterAll(async () => {
  await shared.close();
});

/**
 * A clean, fully migrated database on the shared instance. Cheaper than
 * booting PGlite's WASM runtime per test — only a schema reset and the
 * migrations run between tests, not a fresh engine.
 */
async function freshDatabase(): Promise<PostgresStore> {
  await shared.exec("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  return PostgresStore.fromClient(fromPGlite(shared));
}

describeStore("PostgresStore", freshDatabase);
