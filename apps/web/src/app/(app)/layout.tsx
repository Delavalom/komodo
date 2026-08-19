import type { ReactNode } from "react";

/**
 * The app shell is fixed-height: nothing here scrolls except the panes that
 * own an `overflow-y-auto`. This used to live on `<body>`, but the marketing
 * half needs the document to scroll — so the rule moved down here, where it
 * only binds the routes it applies to.
 *
 * docs/SPEC.md §8 · docs/SPEC-MARKETING.md §M12.2 · AGENTS.md rule 8.
 */
export default function AppShellLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      {children}
    </div>
  );
}
