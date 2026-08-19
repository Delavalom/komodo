import type { Metadata } from "next";

import {
  FeaturePageView,
  featureMetadata,
} from "@/components/marketing/feature-page";
import { InstallTabs } from "@/components/marketing/install-tabs";

export const metadata: Metadata = featureMetadata("cli");

/** docs/SPEC-MARKETING.md §M8 — plus the package-manager tab strip. */
export default function Page() {
  return <FeaturePageView slug="cli" extra={<InstallTabs />} />;
}
