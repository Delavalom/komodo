/**
 * POST /api/v1/repos/:id/retrigger — send a repository's reviews back to the
 * work list.
 *
 * What the queue's retrigger button does, for every judgment in one
 * repository. The ingester picks them up on its next pass; nothing here waits
 * for a review to run, because a review takes minutes and an HTTP request
 * should not.
 */
import { authenticate, unauthorized } from "@/lib/api/auth";
import { routeParam } from "@/lib/api/request";
import { getStore } from "@/lib/data/server";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticate(request);
  if (!auth.ok) return unauthorized(auth);

  // `owner/name`. Already decoded by Next — see lib/api/request.ts.
  const { id } = await params;
  const repoId = routeParam(id);

  const store = await getStore();
  const { repositories, judgments } = await store.snapshot();
  if (!repositories.some((r) => r.id === repoId)) {
    return Response.json({ error: "No such repository." }, { status: 404 });
  }

  const ids = judgments.filter((j) => j.repoId === repoId).map((j) => j.id);
  await store.retriggerReviews(ids);

  return Response.json({ retriggered: ids.length });
}
