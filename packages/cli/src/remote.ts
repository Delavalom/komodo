/**
 * Where a claim and a submission go.
 *
 * `claim` and `submit` used to know exactly one answer: a SQLite file on this
 * disk, opened directly, with a `postgres://` URL refused outright. That made
 * queue-job mode work on a laptop and nowhere else — the deployment those
 * commands were written for is a `komodo serve`, and an agent cannot open its
 * database from another machine.
 *
 * So there are two targets now, and this is the seam between them. The local
 * one is unchanged and still the default, because a single-person `komodo dev`
 * should not have to mint an API key to review its own queue. The remote one
 * speaks to the same port through the HTTP API.
 */
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

import {
  normalizeHost,
  RemoteClaimSchema,
  type RemoteClaim,
  type ReviewRecord,
} from "@komodo/core";
import { isPostgresUrl } from "@komodo/store/connect";

/** A saved deployment and the key that opens it. */
export interface StoredCredentials {
  host: string;
  apiKey: string;
}

export type Target =
  | { kind: "local"; database: string }
  | { kind: "remote"; host: string; apiKey: string };

export interface TargetOptions {
  host?: string;
  apiKey?: string;
  db?: string;
}

/** Where `komodo-review login` keeps a host and its key. */
export function credentialsPath(): string {
  return join(homedir(), ".komodo", "host.json");
}

/**
 * The host and key `login` saved, if any.
 *
 * Exported because `submit` needs the key for a host it was handed in a claim
 * file rather than one it resolved itself — the claim already names the
 * deployment, and asking the user to repeat it would be asking twice.
 */
export function readCredentials(): StoredCredentials | null {
  try {
    const parsed = JSON.parse(readFileSync(credentialsPath(), "utf8"));
    if (typeof parsed?.host === "string" && typeof parsed?.apiKey === "string") {
      return { host: parsed.host, apiKey: parsed.apiKey };
    }
    return null;
  } catch {
    return null;
  }
}

export function writeCredentials(creds: StoredCredentials): string {
  const path = credentialsPath();
  mkdirSync(dirname(path), { recursive: true });
  // The mode is set as the file is created, not after. Writing first and
  // chmodding second leaves a working credential world-readable for however
  // long those two calls take, which on a shared machine is long enough.
  writeFileSync(path, JSON.stringify(creds, null, 2), { mode: 0o600 });
  // …and again, because `mode` is ignored when the file already existed.
  chmodSync(path, 0o600);
  return path;
}

/**
 * Which deployment this invocation is talking to.
 *
 * Flags beat the environment, the environment beats the saved login, and the
 * absence of all three means the local database — the order somebody would
 * predict, and the one that lets a saved login be overridden for one command
 * without unsetting it.
 */
export function resolveTarget(options: TargetOptions): Target {
  const stored = readCredentials();
  // `||` rather than `??` throughout: a process manager exports an empty
  // string as readily as it exports a value, and `KOMODO_API_KEY=""` resolving
  // to `""` meant a valid saved login was shadowed by nothing at all.
  const host = options.host?.trim() || process.env.KOMODO_HOST?.trim() || stored?.host;

  if (host) {
    const apiKey =
      options.apiKey?.trim() || process.env.KOMODO_API_KEY?.trim() || stored?.apiKey;
    if (!apiKey) {
      throw new Error(
        `No API key for ${host}. Run \`komodo-review login --host ${host} --api-key <key>\`, or pass --api-key. Create a key under Settings → API Keys.`,
      );
    }
    return { kind: "remote", host: normalizeHost(host), apiKey };
  }

  const target =
    options.db?.trim() || process.env.KOMODO_DB?.trim() || join(process.cwd(), ".komodo", "komodo.db");
  if (isPostgresUrl(target)) {
    throw new Error(
      "A Postgres queue is reached over HTTP, not by opening its database. Run `komodo-review login --host <url> --api-key <key>` and claim from there.",
    );
  }
  return { kind: "local", database: resolve(target) };
}

/** The deployment's HTTP API, as the two commands that need it use it. */
export class RemoteKomodo {
  constructor(
    private readonly host: string,
    private readonly apiKey: string,
  ) {}

  /** Leases one queued review, or null when the queue has nothing to do. */
  async claim(): Promise<RemoteClaim | null> {
    const body = await this.send<{ claimed: boolean; claim?: unknown }>(
      "POST",
      "/api/v1/jobs/claim",
    );
    if (!body.claimed) return null;
    // Parsed rather than trusted: the claim is written to disk and read back
    // by a separate command, and a malformed one should fail here where the
    // message can still say which deployment produced it.
    return RemoteClaimSchema.parse(body.claim);
  }

  async submitClaimed(
    jobId: string,
    workerId: string,
    record: ReviewRecord,
  ): Promise<{ reviewId: string; url?: string; settled: boolean }> {
    return this.send(
      "POST",
      `/api/v1/jobs/${encodeURIComponent(jobId)}/submit`,
      { workerId, record },
    );
  }

  async submitDirect(
    prId: string,
    record: ReviewRecord,
  ): Promise<{ reviewId: string; url?: string }> {
    return this.send("POST", "/api/v1/reviews", { prId, record });
  }

  /** Proves the host is a Komodo and the key works, for `login` and `doctor`. */
  async check(): Promise<{ organization: { name: string }; repositories: unknown[] }> {
    return this.send("GET", "/api/v1/queue");
  }

  private async send<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.host}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      // A refused connection here almost always means the host is wrong or the
      // deployment is down, and saying so beats a bare fetch failure.
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`Could not reach ${this.host}: ${detail}`);
    }

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`${this.host}${path} → ${res.status}: ${errorFrom(text)}`);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      // An HTML body from a proxy that never reached Komodo. The status was
      // 200, so nothing above would have caught it.
      throw new Error(
        `${this.host}${path} answered with something that is not JSON. Is that a Komodo deployment?`,
      );
    }
  }
}

/** The server's own message when it sent one, rather than a wall of HTML. */
function errorFrom(text: string): string {
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed?.error === "string") {
      const issues = Array.isArray(parsed.issues)
        ? ` (${parsed.issues.map((i: { path?: unknown[]; message?: string }) => `${(i.path ?? []).join(".")}: ${i.message}`).join("; ")})`
        : "";
      return `${parsed.error}${issues}`;
    }
  } catch {
    /* not JSON; fall through to the raw body */
  }
  return text.slice(0, 500);
}
