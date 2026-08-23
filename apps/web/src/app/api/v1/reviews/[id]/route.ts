/**
 * GET /api/v1/reviews/:id — one review run, with its judgements and answers.
 *
 * Outside the queue listing for the same reason it is outside the snapshot: a
 * run carries every judgement body the reviewer wrote, and most callers want
 * the row rather than the review.
 */
import { authenticate, unauthorized } from "@/lib/api/auth";
import { getStore } from "@/lib/data/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticate(request);
  if (!auth.ok) return unauthorized(auth);

  // The id is `owner/name#number@sha`, so it arrives percent-encoded.
  const { id } = await params;
  const detail = await (await getStore()).loadReview(decodeURIComponent(id));
  if (!detail) {
    return Response.json({ error: "No such review run." }, { status: 404 });
  }
  return Response.json(detail);
}
