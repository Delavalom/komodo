import type { ReactNode } from "react";
import { SettingsSidebar } from "@/components/settings/sidebar";

export default async function SettingsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <SettingsSidebar orgSlug={org} />
      <div className="min-w-0 flex-1 overflow-y-auto px-6 py-6">{children}</div>
    </div>
  );
}
