/**
 * The connection options a URL does not carry.
 *
 * `PostgresStore.connect` is the one code path the conformance suite cannot
 * reach — it runs the driver through PGlite, which needs no pool and no TLS.
 * So the decisions made there get tested directly, because the failure mode
 * is a deployment that will not start and an error message that does not say
 * why.
 */
import { describe, expect, it } from "vitest";

import { isPostgresUrl } from "../src/connect.js";
import { poolTuning } from "../src/postgres.js";

describe("isPostgresUrl", () => {
  it("recognises both spellings", () => {
    expect(isPostgresUrl("postgres://u:p@host/db")).toBe(true);
    expect(isPostgresUrl("postgresql://u:p@host/db")).toBe(true);
  });

  it("treats anything else as a SQLite path", () => {
    expect(isPostgresUrl(".komodo/komodo.db")).toBe(false);
    expect(isPostgresUrl("/var/lib/komodo/komodo.db")).toBe(false);
    expect(isPostgresUrl(":memory:")).toBe(false);
    // A near-miss that must not be mistaken for a connection string.
    expect(isPostgresUrl("./postgres-backup.db")).toBe(false);
  });
});

describe("poolTuning", () => {
  it("enables TLS for a hosted database", () => {
    // Railway, Neon, Supabase and RDS all require it, and `pg` does not infer
    // it from the URL — without this the deployment fails at connect with a
    // bare "connection terminated".
    const options = poolTuning("postgres://u:p@containers.railway.app:5432/railway");
    expect(options.ssl).toEqual({ rejectUnauthorized: false });
  });

  it("leaves localhost alone", () => {
    // A developer's own Postgres has no certificate to present.
    for (const host of ["localhost", "127.0.0.1", "::1"]) {
      const url = `postgres://u:p@${host}:5432/komodo`;
      expect(poolTuning(url).ssl, url).toBeUndefined();
    }
  });

  it("defers to an explicit sslmode rather than overriding it", () => {
    // A deployment that asked for verify-full means it, and must not be
    // silently downgraded to a connection that skips verification.
    const options = poolTuning(
      "postgres://u:p@db.example.com/komodo?sslmode=verify-full",
    );
    expect(options.ssl).toBeUndefined();
  });

  it("bounds the pool and the wait for a connection", () => {
    const options = poolTuning("postgres://u:p@db.example.com/komodo");
    expect(options.max).toBe(10);
    // A poller must fail an attempt rather than hang the ingest pass on it.
    expect(options.connectionTimeoutMillis).toBeGreaterThan(0);
  });

  it("changes nothing for a string it cannot parse", () => {
    // Better to leave every default alone than to guess at a string `pg` may
    // still understand.
    expect(poolTuning("host=db user=komodo")).toEqual({});
  });
});
