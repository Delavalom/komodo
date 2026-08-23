import type { ReactNode } from "react";

import { DataProvider } from "@/lib/data/provider";
import { loadSnapshot, requestNow } from "@/lib/data/server";

/**
 * The app shell is fixed-height: nothing here scrolls except the panes that
 * own an `overflow-y-auto`. This used to live on `<body>`, but the marketing
 * half needs the document to scroll — so the rule moved down here, where it
 * only binds the routes it applies to.
 *
 * It is also where the shared data enters: one load per request, handed to the
 * client hooks through DataProvider. Only the app group gets it, which is why
 * the marketing routes stay static.
 *
 * · AGENTS.md rule 8.
 */
/**
 * The queue is live data, so these routes render per request. Prerendering
 * would bake one snapshot of the team's PRs into static HTML at build time.
 */
export const dynamic = "force-dynamic";

export default async function AppShellLayout({
  children,
}: {
  children: ReactNode;
}) {
  const snapshot = await loadSnapshot();
  const now = requestNow();

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <DataProvider snapshot={snapshot} now={now}>
        {children}
      </DataProvider>
    </div>
  );
}
