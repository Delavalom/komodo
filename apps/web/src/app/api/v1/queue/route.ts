/**
 * GET /api/v1/queue — the team's review queue as data.
 *
 * The same snapshot the UI renders from, so anything the queue shows can be
 * read by a script without scraping a page. Thin by design: the port already
 * answers this question, and a second implementation of "what is in the
 * queue" is a second thing that can disagree with the first.
 */
import { authenticate, unauthorized } from "@/lib/api/auth";
import { getStore } from "@/lib/data/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) return unauthorized(auth);

  const snapshot = await (await getStore()).snapshot();

  // Deliberately not the whole snapshot: `settings` carries the deployment's
  // configuration, and a key that can read the queue has no business reading
  // that.
  return Response.json({
    organization: snapshot.organization,
    repositories: snapshot.repositories,
    judgments: snapshot.judgments,
    findings: snapshot.findings,
  });
}
