import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import pc from "picocolors";

import { INTERACTIVE_LEASE_MS } from "@komodo/core";
import { connectStore } from "@komodo/store/connect";

import { RemoteKomodo, resolveTarget } from "../remote.js";

/**
 * A claim against a local SQLite queue.
 *
 * Kept separate from the remote one so `submit` can tell the two apart by
 * which field is present. `database` means "open this file"; `host` means
 * "post to this deployment".
 */
export interface InteractiveClaimFile {
  version: 1;
  database: string;
  workerId: string;
  jobId: string;
  headSha: string;
  prId: string;
  repoId: string;
  number: number;
  url: string;
  title: string;
  author: string;
  claimedAt: number;
}

/** Claim one job for an already-running, enterprise-approved agent. */
export async function claimCommand(opts: {
  db?: string;
  out?: string;
  host?: string;
  apiKey?: string;
}): Promise<void> {
  const target = resolveTarget(opts);

  const claim =
    target.kind === "remote"
      ? await claimRemote(target.host, target.apiKey)
      : await claimLocal(target.database);

  if (!claim) {
    console.log(pc.dim("No AI review job is queued."));
    return;
  }

  const output = resolve(
    opts.out ?? join(process.cwd(), ".komodo", "claims", `${safeName(claim.jobId)}.json`),
  );
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(claim, null, 2));

  console.log(output);
  console.log(`${claim.repoId}#${claim.number} — ${claim.title}`);
  console.log(
    `Check out this exact head, then submit with: komodo-review submit ${output} <result.json>`,
  );
}

async function claimRemote(host: string, apiKey: string) {
  const claim = await new RemoteKomodo(host, apiKey).claim();
  return claim;
}

async function claimLocal(database: string) {
  const workerId = `interactive-${process.pid}-${Date.now()}`;
  const store = await connectStore(database);
  try {
    const claim = await store.claimNextAIReview({
      workerId,
      now: Date.now(),
      // An interactive review may involve tracing unfamiliar code. Keep it
      // out of the local worker's reclaim path for a working session.
      leaseMs: INTERACTIVE_LEASE_MS,
    });
    if (!claim) return null;

    const context: InteractiveClaimFile = {
      version: 1,
      database,
      workerId,
      jobId: claim.job.id,
      headSha: claim.job.headSha,
      prId: claim.pr.id,
      repoId: claim.pr.repoId,
      number: claim.pr.number,
      url: claim.pr.url,
      title: claim.pr.title,
      author: claim.pr.author,
      claimedAt: Date.now(),
    };
    return context;
  } finally {
    store.close();
  }
}

const safeName = (value: string): string => value.replace(/[^a-zA-Z0-9._-]+/g, "-");
