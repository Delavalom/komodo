import { notFound, redirect } from "next/navigation";
import { ORG } from "@/lib/data/seed";

export default async function OrgRoot({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  if (org !== ORG.slug) notFound();
  redirect(`/${org}/-/pull-requests`);
}
