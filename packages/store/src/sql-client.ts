/**
 * The little bit of a Postgres client the driver actually uses.
 *
 * Narrow on purpose: `pg` backs it in production, and PGlite — real Postgres
 * compiled to WASM — backs it in the tests. That is what lets the conformance
 * suite run the Postgres driver's actual SQL with no server to start, instead
 * of shipping a driver nobody has executed.
 */
export interface SqlClient {
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
  /** Multi-statement, no parameters. Used once, for the schema. */
  exec(text: string): Promise<void>;
  close(): Promise<void>;
}

/** Shape of `pg.Pool` — typed structurally so `pg` stays an optional import. */
interface PgPoolLike {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
  end(): Promise<void>;
}

export function fromPgPool(pool: PgPoolLike): SqlClient {
  return {
    async query<T>(text: string, params?: unknown[]) {
      const result = await pool.query(text, params);
      return { rows: result.rows as T[] };
    },
    async exec(text: string) {
      await pool.query(text);
    },
    close: () => pool.end(),
  };
}
