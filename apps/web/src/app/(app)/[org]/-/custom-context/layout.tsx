import type { ReactNode } from "react";
import { MemorySidebar } from "@/components/memory/sidebar";

export default async function MemoryLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <MemorySidebar orgSlug={org} />
      <div className="flex min-w-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
