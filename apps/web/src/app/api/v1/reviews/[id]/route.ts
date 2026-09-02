/**
 * GET /api/v1/reviews/:id — one review run, with its judgements and answers.
 *
 * Outside the queue listing for the same reason it is outside the snapshot: a
 * run carries every judgement body the reviewer wrote, and most callers want
 * the row rather than the review.
 */
import { authenticate, unauthorized } from "@/lib/api/auth";
import { routeParam } from "@/lib/api/request";
import { getStore } from "@/lib/data/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticate(request);
  if (!auth.ok) return unauthorized(auth);

  // The id is `owner/name#number@sha`. Next hands a dynamic segment already
  // decoded, so decoding it again turned a `%25` into a bare `%` and threw a
  // URIError out of the handler as a 500 — and quietly turned `%252F` into a
  // path separator. See lib/api/request.ts.
  const { id } = await params;
  const detail = await (await getStore()).loadReview(routeParam(id));
  if (!detail) {
    return Response.json({ error: "No such review run." }, { status: 404 });
  }
  return Response.json(detail);
}
