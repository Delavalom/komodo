import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { OrgHeader } from "@/components/shell/org-header";
import { TrialBanner } from "@/components/shell/banner";
import { IS_CLOUD } from "@/lib/flags";
import { loadSnapshot } from "@/lib/data/server";

export default async function OrgLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  // One organization per deployment; anything else is a 404, as it is on the
  // original.
  const { organization } = await loadSnapshot();
  if (org !== organization.slug) notFound();

  return (
    <>
      {IS_CLOUD ? <TrialBanner /> : null}
      <OrgHeader />
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
    </>
  );
}
