import type { Metadata } from "next";

import {
  FeaturePageView,
  featureMetadata,
} from "@/components/marketing/feature-page";
import {
  Container,
  MonoLabel,
  Section,
  SectionRule,
} from "@/components/marketing/ui";

export const metadata: Metadata = featureMetadata("partners");

/* Invented partners — this repo ships no third-party marks. §M12.3 */
const PARTNERS = [
  "Northbeam",
  "Halyard",
  "Tessellate",
  "Coastline",
  "Ardent",
  "Kilnworks",
  "Perigee",
  "Bramble",
  "Lattice Pay",
  "Fernway",
  "Stonecrop",
  "Beacon Auth",
];

/** docs/SPEC-MARKETING.md §M8 — the partner grid replaces the cross-links. */
export default function Page() {
  return (
    <FeaturePageView
      slug="partners"
      extra={
        <Section className="border-b border-current/10">
          <Container>
            <SectionRule>Partners supplying review context</SectionRule>
            <div className="grid grid-cols-2 gap-px bg-current/10 py-14 sm:grid-cols-3 lg:grid-cols-4">
              {PARTNERS.map((partner) => (
                <div
                  key={partner}
                  className="flex flex-col items-center justify-center gap-2 bg-mkt-ground px-6 py-10"
                >
                  <span className="font-display text-lg font-semibold opacity-45">
                    {partner}
                  </span>
                  <MonoLabel className="opacity-40">api context</MonoLabel>
                </div>
              ))}
            </div>
          </Container>
        </Section>
      }
    />
  );
}
