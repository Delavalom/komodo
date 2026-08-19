import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { OrgHeader } from "@/components/shell/org-header";
import { TrialBanner } from "@/components/shell/banner";
import { ORG } from "@/lib/data/seed";

export default async function OrgLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  // Only one organization exists in the dummy dataset; anything else is a 404,
  // as it is on the original. docs/SPEC.md §10.
  if (org !== ORG.slug) notFound();

  return (
    <>
      <TrialBanner />
      <OrgHeader />
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
    </>
  );
}
