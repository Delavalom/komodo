import { redirect } from "next/navigation";

export default async function SettingsIndex({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  redirect(`/${org}/-/settings/manage-repos`);
}
