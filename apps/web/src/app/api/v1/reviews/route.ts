/**
 * POST /api/v1/reviews — store a review nobody asked for.
 *
 * Queue-job mode starts from a job. This is the other way round: someone
 * reviewed a branch on their own machine, in the session they were already
 * working in, and wants the result in the team's queue. There is no lease to
 * check because there was never a job — what stands in for it is that the pull
 * request has to already exist in the store, at the head the review read.
 *
 * That last condition is the whole safety property here. Without it this route
 * would accept a review of any commit for any pull request, including one the
 * deployment has never seen, and the queue would be showing rows nothing
 * polled.
 */
import { revalidatePath } from "next/cache";
import { DirectSubmissionSchema } from "@komodo/core";

import { authenticate, unauthorized } from "@/lib/api/auth";
import { deploymentUrl } from "@/lib/api/host";
import { readJsonBody } from "@/lib/api/request";
import { getStore } from "@/lib/data/server";
import { storeSubmittedReview, submittedReviewUrl } from "@/lib/data/submission";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) return unauthorized(auth);

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = DirectSubmissionSchema.safeParse(body.value);
  if (!parsed.success) {
    return Response.json(
      { error: "The submission did not validate.", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { prId, record } = parsed.data;

  const store = await getStore();
  const snapshot = await store.snapshot();
  const pr = snapshot.pullRequests.find((candidate) => candidate.id === prId);
  if (!pr) {
    return Response.json(
      {
        error: `${prId} is not in this deployment's inventory. The poller writes pull requests; a review cannot invent one.`,
      },
      { status: 404 },
    );
  }
  // A repository somebody switched off is one this deployment was told to stop
  // touching. Writing a review into it would put rows on a screen the operator
  // believes is not being fed.
  if (!snapshot.repositories.find((repo) => repo.id === pr.repoId)?.enabled) {
    return Response.json(
      { error: `${pr.repoId} is switched off in Manage Repositories.` },
      { status: 409 },
    );
  }

  if (pr.headSha !== record.pr.headSha) {
    return Response.json(
      {
        error: `${prId} is at ${pr.headSha.slice(0, 12)}, but the review reads ${record.pr.headSha.slice(0, 12)}. Re-review the current head.`,
      },
      { status: 409 },
    );
  }

  // A review of this head that somebody has already been answering. Writing
  // over it is not an update — `saveReview` replaces the judgements, and the
  // answers keyed to them stay behind, attached to questions whose text has
  // changed underneath. So: one review per head by this route, and a re-run
  // goes through the queue like everything else.
  const existing = await store.loadReview(`${prId}@${record.pr.headSha}`);
  if (existing) {
    return Response.json(
      {
        error: `${prId} already has a review of ${record.pr.headSha.slice(0, 12)}. Retrigger it from the queue to review this head again.`,
        reviewId: existing.review.id,
      },
      { status: 409 },
    );
  }

  let stored;
  try {
    stored = await storeSubmittedReview(store, prId, record);
  } catch (err) {
    // Three writes and no transaction — the port has no such API. Saying what
    // broke beats a bodyless 500 the caller cannot act on.
    return Response.json(
      {
        error: `The review could not be stored: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 },
    );
  }

  // A job may exist for this head anyway — the poller queues one automatically
  // and somebody reviewed it by hand before the worker got to it. Settling it
  // is what stops the headless pass reviewing the same commit again.
  const job = (await store.listAIReviewJobs()).find(
    (candidate) =>
      candidate.prId === prId &&
      candidate.headSha === record.pr.headSha &&
      (candidate.state === "queued" || candidate.state === "running"),
  );
  // Superseded rather than finished: this caller holds no lease and must not
  // pretend to. `finishAIReviewJob` refuses everything but its own worker,
  // which is right for a worker reporting on itself and has no answer for
  // "somebody else already did this work".
  if (job) await store.supersedeAIReviewJob(job.id, Date.now());

  revalidatePath("/", "layout");
  return Response.json({
    ...stored,
    url: submittedReviewUrl(deploymentUrl(request), prId, record.pr.headSha),
  });
}
