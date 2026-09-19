/**
 * Submitting a review to a Komodo deployment over HTTP.
 *
 * Queue-job mode already existed, but only against a SQLite file on the same
 * disk: `komodo-review claim` opened the database directly and refused a
 * `postgres://` URL outright. That made the mode unusable against the
 * deployment it was designed for. A team's queue lives in a `komodo serve` —
 * on localhost, in a container, or behind a proxy — and an agent on a laptop
 * cannot open its database, so the whole interactive path stopped at the one
 * deployment shape nobody runs for a team.
 *
 * These are the shapes that cross that boundary. They live in core because
 * both ends need them and neither end owns them: the CLI writes them, the web
 * app's API routes parse them, and a mismatch between the two is exactly the
 * bug a shared schema prevents.
 */
import { randomUUID } from "node:crypto";

import { z } from "zod";

import { ReviewRecordSchema } from "./schema.js";

/**
 * How long an interactive lease is good for.
 *
 * Long, because the agent on the other end is reading unfamiliar code with a
 * person watching, not running a headless pass. The local claim command uses
 * the same constant: the two modes must not disagree about when a claim goes
 * stale, or the same review is reclaimed under one and not the other.
 */
export const INTERACTIVE_LEASE_MS = 2 * 60 * 60_000;

/**
 * What a deployment hands back when it leases a job, and what `submit` reads.
 *
 * Deliberately the same shape as the local claim file with `host` in place of
 * `database` — one field says where the result goes, and everything else is
 * what the agent needs to check out the right commit.
 */
export const RemoteClaimSchema = z.object({
  version: z.literal(1),
  /** The deployment this claim is against. Normalized, no trailing slash. */
  host: z.string().min(1),
  workerId: z.string().min(1),
  jobId: z.string().min(1),
  headSha: z.string().min(1),
  prId: z.string().min(1),
  repoId: z.string().min(1),
  number: z.number().int().positive(),
  url: z.string(),
  title: z.string(),
  author: z.string(),
  claimedAt: z.number(),
});

export type RemoteClaim = z.infer<typeof RemoteClaimSchema>;

/**
 * What `submit` posts back.
 *
 * The record carries the result, the files and the head it was read from, so
 * there is nothing else to send. `workerId` proves this is the session that
 * holds the lease — the store settles a job only for the worker that owns it,
 * and without this the second agent to finish could close the first one's job.
 */
export const RemoteSubmissionSchema = z.object({
  workerId: z.string().min(1),
  record: ReviewRecordSchema,
});

export type RemoteSubmission = z.infer<typeof RemoteSubmissionSchema>;

/** A claimless submission: a review of a pull request with no job behind it. */
export const DirectSubmissionSchema = z.object({
  /** `owner/name#number`. The pull request must already be in the store. */
  prId: z.string().min(1),
  record: ReviewRecordSchema,
});

export type DirectSubmission = z.infer<typeof DirectSubmissionSchema>;

/**
 * The worker id a claim is leased under.
 *
 * Two jobs, and both matter.
 *
 * It names the API key that took the lease, so the submit route can refuse a
 * key that did not — the worker id itself is not a secret and must not be
 * treated as one. It travels in a claim file and it is visible on the queue's
 * own unauthenticated screens, so anything that relied on it being unguessable
 * would already be broken.
 *
 * And it carries a random tail, so two agents holding the same key are still
 * two workers: without it the second agent to finish would satisfy the first
 * one's lease check and settle a job it never did. `randomUUID` rather than
 * `Math.random`, because the tail is the only thing separating them.
 */
export function interactiveWorkerId(keyId: string): string {
  return `${workerPrefix(keyId)}${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

/** The part of a worker id that names the key. See `interactiveWorkerId`. */
export function workerPrefix(keyId: string): string {
  return `api-key:${keyId}:`;
}

/**
 * A deployment URL, or a reason it will not be used.
 *
 * The one refusal that matters is an API key over plaintext to somewhere that
 * is not this machine: `http://komodo.internal` puts a working credential on
 * the wire in clear text, and the person who typed it has no way to see that
 * happen. Loopback is exempt because there is no wire.
 *
 * Every URL that carries a key goes through here, including one read back out
 * of a claim file — a claim names the deployment to submit to, and a claim
 * file is a thing on disk that some other process may have written.
 */
export function normalizeHost(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) throw new Error("A Komodo host cannot be empty.");

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error(`Not a usable Komodo host: ${raw}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(
      `A Komodo host is an http:// or https:// URL. ${url.protocol}// is not one.`,
    );
  }
  if (url.protocol === "http:" && !isLoopback(url.hostname)) {
    throw new Error(
      `Refusing to send an API key in clear text to ${url.hostname}. Use https://, or an SSH tunnel to localhost.`,
    );
  }
  // The pathname survives: a deployment behind a proxy at /komodo has its
  // routes under that prefix, and dropping it would 404 every request.
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

/**
 * Whether an address reaches this machine and nothing else.
 *
 * The whole of 127/8 counts, and so does `0.0.0.0` — both reach a listener
 * here and neither puts a packet on a network. `127.1` is the same address
 * written short, and WHATWG's parser has already expanded it by the time this
 * sees it, which is why the check is on the parsed form.
 *
 * `*.localhost` is deliberately NOT accepted. RFC 6761 says it must resolve to
 * loopback, but Node asks the system resolver, and a resolver that answers
 * `evil.localhost` with a public address would turn this exemption into the
 * exact hole it exists to close. A credential is not worth that bet.
 */
function isLoopback(hostname: string): boolean {
  // A URL keeps IPv6 literals in brackets.
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost") return true;
  if (host === "::1" || host === "0:0:0:0:0:0:0:1") return true;
  // IPv4-mapped IPv6, which is how some stacks spell a loopback address.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(host);
  const candidate = mapped ? mapped[1] : host;
  if (candidate === "0.0.0.0") return true;
  const octets = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(candidate);
  return octets !== null && Number(octets[1]) === 127;
}
