/**
 * POST /api/v1/reviews/:id/receipt — post the decided outcome to GitHub.
 *
 * The same action the closing screen's button calls, so a team that finishes
 * reviews in a script gets the identical comment, upserted onto the identical
 * marker, rather than a second Komodo comment in a different shape.
 */
import { authenticate, unauthorized } from "@/lib/api/auth";
import { postReceipt } from "@/lib/data/actions";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticate(request);
  if (!auth.ok) return unauthorized(auth);

  const { id } = await params;
  try {
    const url = await postReceipt(decodeURIComponent(id));
    return Response.json({ url });
  } catch (err) {
    // A missing token or an unknown run. Both are the caller's to fix, and
    // both are worth saying out loud — nothing was written either way.
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
