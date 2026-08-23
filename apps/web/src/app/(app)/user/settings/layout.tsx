import type { ReactNode } from "react";
import { PersonalHeader } from "@/components/shell/org-header";
import { PersonalSidebar } from "@/components/personal/sidebar";

export default function PersonalSettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <PersonalHeader />
      <main className="flex min-h-0 flex-1 overflow-hidden">
        <PersonalSidebar />
        <div className="min-w-0 flex-1 overflow-y-auto px-6 py-6">{children}</div>
      </main>
    </>
  );
}
