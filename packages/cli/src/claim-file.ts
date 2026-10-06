import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

import { INTERACTIVE_LEASE_MS, RemoteClaimSchema } from "@komodo/core";

const LocalClaimSchema = z.object({
  version: z.literal(1),
  database: z.string().min(1),
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

/**
 * Either kind of claim.
 *
 * `database` and `host` are what tell them apart, and the union is discriminated
 * on which one is present rather than on a `kind` field — the local shape was
 * already on disk in other people's working directories before the remote one
 * existed, and it has to keep parsing.
 */
export const ClaimSchema = z.union([LocalClaimSchema, RemoteClaimSchema]);
export type Claim = z.infer<typeof ClaimSchema>;

/**
 * What `claim --json` and `checkout --json` print: one line a program can read.
 *
 * `claimPath` is null when nothing was queued. `leaseExpiresAt` is computed
 * here so a caller showing time left never carries its own copy of the lease.
 */
export type ClaimOutput =
  | { claimPath: null }
  | { claimPath: string; claim: Claim; leaseExpiresAt: number; checkedOut: boolean };

export function claimOutput(claimPath: string, claim: Claim, checkedOut: boolean): ClaimOutput {
  return { claimPath, claim, leaseExpiresAt: claim.claimedAt + INTERACTIVE_LEASE_MS, checkedOut };
}

/** A claim file, parsed. A path somebody typed goes through the schema before anything uses it. */
export function readClaimFile(path: string): Claim {
  return ClaimSchema.parse(readJson(resolve(path)));
}

export function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read JSON from ${path}: ${detail}`);
  }
}
