import { redirect } from "next/navigation";

export default async function MemoryIndex({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  redirect(`/${org}/-/custom-context/context`);
}
