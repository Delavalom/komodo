import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import pc from "picocolors";

import { connectStore, isPostgresUrl } from "@komodo/store/connect";

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

/** Claim one local job for an already-running, enterprise-approved agent. */
export async function claimCommand(opts: {
  db?: string;
  out?: string;
}): Promise<void> {
  const target =
    opts.db ?? process.env.KOMODO_DB ?? join(process.cwd(), ".komodo", "komodo.db");
  if (isPostgresUrl(target)) {
    throw new Error(
      "Interactive claims are local-only. Point --db at the SQLite file used by komodo dev.",
    );
  }
  const database = resolve(target);
  const workerId = `interactive-${process.pid}-${Date.now()}`;
  const store = await connectStore(database);
  try {
    const claim = await store.claimNextAIReview({
      workerId,
      now: Date.now(),
      // An interactive review may involve tracing unfamiliar code. Keep it
      // out of the local worker's reclaim path for a working session.
      leaseMs: 2 * 60 * 60_000,
    });
    if (!claim) {
      console.log(pc.dim("No AI review job is queued."));
      return;
    }

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
    const output = resolve(
      opts.out ?? join(process.cwd(), ".komodo", "claims", `${safeName(claim.job.id)}.json`),
    );
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify(context, null, 2));

    console.log(output);
    console.log(`${claim.pr.repoId}#${claim.pr.number} — ${claim.pr.title}`);
    console.log(`Check out this exact head, then submit with: komodo-review submit ${output} <result.json>`);
  } finally {
    store.close();
  }
}

const safeName = (value: string): string => value.replace(/[^a-zA-Z0-9._-]+/g, "-");
