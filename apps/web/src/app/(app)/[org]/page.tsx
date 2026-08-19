import { notFound, redirect } from "next/navigation";
import { loadSnapshot } from "@/lib/data/server";

export default async function OrgRoot({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const { organization } = await loadSnapshot();
  if (org !== organization.slug) notFound();
  redirect(`/${org}/-/pull-requests`);
}
