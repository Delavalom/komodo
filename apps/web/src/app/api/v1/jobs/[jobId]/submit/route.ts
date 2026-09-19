/**
 * POST /api/v1/jobs/:jobId/submit — complete a claimed review.
 *
 * The other half of the interactive path. The agent holds the lease, has the
 * checkout, and has written a ReviewResult; this validates what it sends,
 * writes the run, and settles the job — the same three writes the ingester
 * makes, so a review that arrives this way is indistinguishable from one
 * `komodo serve` produced.
 *
 * Nothing here trusts the sender past its API key, and the checks are in the
 * order that matters: whether this key holds the lease, whether the record
 * describes the pull request the lease is for, and whether it read the commit
 * the lease was taken at. A stale claim submitting a review of a commit that
 * has been force-pushed away, or a record carrying somebody else's diff, are
 * both refusals rather than rows.
 */
import { revalidatePath } from "next/cache";
import { RemoteSubmissionSchema, workerPrefix } from "@komodo/core";

import { authenticate, unauthorized } from "@/lib/api/auth";
import { deploymentUrl } from "@/lib/api/host";
import { readJsonBody, routeParam } from "@/lib/api/request";
import { getStore } from "@/lib/data/server";
import { storeSubmittedReview, submittedReviewUrl } from "@/lib/data/submission";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const auth = await authenticate(request);
  if (!auth.ok) return unauthorized(auth);

  const { jobId: raw } = await params;
  const jobId = routeParam(raw);

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = RemoteSubmissionSchema.safeParse(body.value);
  if (!parsed.success) {
    // The agent can fix this and try again, and telling it exactly which field
    // failed is the difference between one retry and ten.
    return Response.json(
      { error: "The submission did not validate.", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { workerId, record } = parsed.data;

  const store = await getStore();
  const job = (await store.listAIReviewJobs()).find((candidate) => candidate.id === jobId);
  if (!job) {
    return Response.json({ error: "No such review job." }, { status: 404 });
  }

  // Three conditions, and the key one is not the worker id. A worker id is not
  // a secret — it travels in a claim file and appears on the queue's own
  // unauthenticated screens — so a route that accepted any caller presenting
  // one would let any key settle any other key's job. What has to match is the
  // credential the lease was taken with.
  const ownedByThisKey = job.workerId?.startsWith(workerPrefix(auth.key.id)) ?? false;
  if (job.state !== "running" || job.workerId !== workerId || !ownedByThisKey) {
    return Response.json(
      {
        error:
          "This job is not leased to that worker on this API key. Claim it again before submitting.",
      },
      { status: 409 },
    );
  }

  if (record.pr.headSha !== job.headSha) {
    return Response.json(
      {
        error: `This job was claimed at ${job.headSha.slice(0, 12)}, but the review reads ${record.pr.headSha.slice(0, 12)}. Check out the claimed head and review that.`,
      },
      { status: 409 },
    );
  }

  // The record names a pull request too, and it has to be the one the lease is
  // for. Without this, a record built from an entirely different change — its
  // files, its patches, its judgements — is stored as this pull request's
  // review, and nothing downstream can tell.
  const claimed = `${record.pr.owner}/${record.pr.repo}#${record.pr.number}`;
  if (claimed !== job.prId) {
    return Response.json(
      {
        error: `This job is for ${job.prId}, but the review describes ${claimed}.`,
      },
      { status: 409 },
    );
  }

  let stored;
  try {
    stored = await storeSubmittedReview(store, job.prId, record);
  } catch (err) {
    // The three writes are not one transaction — the port has no such API — so
    // a failure halfway leaves a judgment row with no review, and the queue
    // would advertise a completed review that cannot be opened. Releasing the
    // lease is what lets somebody retry: without it the job sits `running` for
    // two hours and no worker touches it.
    await store.finishAIReviewJob({
      jobId,
      workerId,
      state: "failed",
      finishedAt: Date.now(),
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json(
      {
        error: `The review could not be stored: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 },
    );
  }

  const settled = await store.finishAIReviewJob({
    jobId,
    workerId,
    state: "completed",
    finishedAt: Date.now(),
  });
  revalidatePath("/", "layout");

  // The review is written either way — saying so matters, because the agent's
  // next move after a failure is usually to review again, and it should not.
  if (!settled) {
    return Response.json(
      {
        ...stored,
        settled: false,
        error:
          "The review was stored, but the lease had already moved on and the job was left as it was.",
      },
      { status: 409 },
    );
  }

  return Response.json({
    ...stored,
    settled: true,
    url: submittedReviewUrl(deploymentUrl(request), job.prId, record.pr.headSha),
  });
}
