/**
 * The Postgres driver against the same suite the SQLite one runs.
 *
 * PGlite is real Postgres compiled to WASM, so this executes the driver's
 * actual SQL — placeholders, JSONB, BIGINT coercion and all — with no server
 * to start. Two drivers that pass the same tests are the only thing keeping
 * `komodo dev` and `komodo serve` honest with each other.
 */
import { PGlite } from "@electric-sql/pglite";

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
    close: () => db.close(),
  };
}

describeStore("PostgresStore", async () =>
  PostgresStore.fromClient(fromPGlite(new PGlite())),
);
