import { redirect } from "next/navigation";

import { loadSnapshot } from "@/lib/data/server";

/**
 * There is no marketing site in front of a self-hosted deployment — reaching
 * the host means you want the queue.
 */
/** Reads the slug out of the store, so it cannot be baked at build time. */
export const dynamic = "force-dynamic";

export default async function Root() {
  const { organization } = await loadSnapshot();
  redirect(`/${organization.slug}/-/queue`);
}
