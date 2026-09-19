/**
 * POST /api/v1/reviews/:id/verification — append evidence for one result check.
 *
 * API evidence is attributed to the key that supplied it. It can satisfy the
 * verification status, but it cannot approve a pull request; GitHub's human
 * review remains a separate authority.
 */
import { authenticate, unauthorized } from "@/lib/api/auth";
import { routeParam } from "@/lib/api/request";
import { getStore } from "@/lib/data/server";
import {
  recordVerificationForActor,
  type VerificationSubmission,
} from "@/lib/data/verification";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticate(request);
  if (!auth.ok) return unauthorized(auth);

  // Already decoded by Next — see lib/api/request.ts.
  const { id } = await params;
  const reviewId = routeParam(id);
  const detail = await (await getStore()).loadReview(reviewId);
  if (!detail) {
    return Response.json({ error: "No such review run." }, { status: 404 });
  }

  try {
    const body = (await request.json()) as Partial<VerificationSubmission>;
    if (
      typeof body.requirementId !== "string" ||
      !detail.verificationRequirements.some((check) => check.id === body.requirementId)
    ) {
      return Response.json(
        { error: "The verification check does not belong to this review run." },
        { status: 400 },
      );
    }

    await recordVerificationForActor(
      body as VerificationSubmission,
      `api-key:${auth.key.prefix}`,
    );
    return Response.json({ recorded: true }, { status: 201 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
