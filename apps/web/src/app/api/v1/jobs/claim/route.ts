/**
 * POST /api/v1/jobs/claim — lease one queued review for an interactive agent.
 *
 * The HTTP half of `komodo-review claim`, and the reason that command is worth
 * anything on a real deployment. The local version opens the SQLite file
 * directly and refuses Postgres, so an agent could only ever claim from a
 * queue running on its own disk — never from the `komodo serve` the team
 * actually uses. This is the same lease through the same port, reached from
 * anywhere the deployment is.
 *
 * Claiming is a write, so it is a POST: calling this takes a job out of the
 * work list and nobody else gets it until the lease expires.
 */
import {
  INTERACTIVE_LEASE_MS,
  interactiveWorkerId,
  type RemoteClaim,
} from "@komodo/core";

import { authenticate, unauthorized } from "@/lib/api/auth";
import { getStore } from "@/lib/data/server";
import { deploymentUrl } from "@/lib/api/host";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) return unauthorized(auth);

  const store = await getStore();
  const claimed = await store.claimNextAIReview({
    // Named for the key rather than its prefix: the submit route refuses a
    // key that did not take the lease, and two keys can share a prefix.
    workerId: interactiveWorkerId(auth.key.id),
    now: Date.now(),
    leaseMs: INTERACTIVE_LEASE_MS,
  });

  // 200 with `claimed: false` rather than 404: an empty queue is a successful
  // answer to "is there work", and a client polling it should not have to
  // treat "nothing to do" as an error.
  if (!claimed) {
    return Response.json({ claimed: false });
  }

  const claim: RemoteClaim = {
    version: 1,
    host: deploymentUrl(request),
    // The store minted the lease under this worker; the agent has to send it
    // back on submit or the job will not settle.
    workerId: claimed.job.workerId ?? "",
    jobId: claimed.job.id,
    headSha: claimed.job.headSha,
    prId: claimed.pr.id,
    repoId: claimed.pr.repoId,
    number: claimed.pr.number,
    url: claimed.pr.url,
    title: claimed.pr.title,
    author: claimed.pr.author,
    claimedAt: Date.now(),
  };
  return Response.json({ claimed: true, claim });
}
