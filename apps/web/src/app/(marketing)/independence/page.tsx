import type { Metadata } from "next";

import {
  FeaturePageView,
  featureMetadata,
} from "@/components/marketing/feature-page";

export const metadata: Metadata = featureMetadata("independence");

/** docs/SPEC-MARKETING.md §M8. */
export default function Page() {
  return <FeaturePageView slug="independence" />;
}
