import type { ReactNode } from "react";

import { AnnouncementBar, MarketingFooter } from "@/components/marketing/chrome";
import { MarketingHeader } from "@/components/marketing/header";
import {
  getFeatureNav,
  getFooterColumns,
  getResourceNav,
} from "@/lib/data/marketing/queries";

/**
 * The marketing shell. docs/SPEC-MARKETING.md §M2.
 *
 * Unlike the app group this scrolls the document — no fixed-height wrapper,
 * no per-pane scroll containers (§M12.2). `.mkt` scopes the marketing palette
 * so it can never reach the app's tokens.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mkt flex min-h-dvh flex-col">
      <AnnouncementBar />
      <MarketingHeader
        featureNav={getFeatureNav()}
        resourceNav={getResourceNav()}
      />
      <main className="flex-1">{children}</main>
      <MarketingFooter columns={getFooterColumns()} />
    </div>
  );
}
