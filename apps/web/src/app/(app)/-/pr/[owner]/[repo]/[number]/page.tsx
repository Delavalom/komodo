/**
 * The permalink a receipt points at.
 *
 * `@komodo/core` writes the GitHub comment and cannot know this deployment's
 * organization slug — there is one org per deployment and the store decides its
 * name. So the link it writes is slug-less, and this resolves it. Any query it
 * carried (`?run=<headSha>`) rides along.
 */
import { redirect } from "next/navigation";

import { loadSnapshot } from "@/lib/data/server";

export default async function ReviewPermalink({
  params,
  searchParams,
}: {
  params: Promise<{ owner: string; repo: string; number: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { owner, repo, number } = await params;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") query.set(key, value);
    else if (Array.isArray(value) && value[0]) query.set(key, value[0]);
  }

  const { organization } = await loadSnapshot();
  const qs = query.toString();
  redirect(
    `/${organization.slug}/-/pull-requests/${owner}/${repo}/${number}${qs ? `?${qs}` : ""}`,
  );
}
