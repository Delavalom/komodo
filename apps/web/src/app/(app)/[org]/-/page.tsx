import { redirect } from "next/navigation";

export default async function OrgIndex({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  redirect(`/${org}/-/pull-requests`);
}
