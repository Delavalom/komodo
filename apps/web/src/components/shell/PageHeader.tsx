import type { ReactNode } from "react";
import { Breadcrumbs } from "@komodo/ui";
import type { Crumb } from "@komodo/ui";

/**
 * Sticky topbar: breadcrumbs left, page actions right.
 * Rendered by each page so the trail reflects that page's location.
 */
export function PageHeader({ crumbs, actions }: { crumbs: Crumb[]; actions?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 h-14 shrink-0 flex items-center justify-between gap-4 px-6 border-b border-border bg-bg/80 backdrop-blur">
      <Breadcrumbs items={crumbs} />
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
  );
}

/** Standard content column beneath the PageHeader. */
export function PageBody({
  children,
  width = "wide",
}: {
  children: ReactNode;
  width?: "wide" | "narrow";
}) {
  return (
    <main
      className={`flex-1 w-full mx-auto px-6 py-8 ${width === "narrow" ? "max-w-3xl" : "max-w-6xl"}`}
    >
      {children}
    </main>
  );
}
