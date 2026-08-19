import type { Metadata } from "next";

import { DocPage } from "@/components/marketing/doc-page";
import { getLegalSections } from "@/lib/data/marketing/queries";

export const metadata: Metadata = {
  title: "Security Practices",
  description:
    "How Greptile is hosted, how customer code is handled, and which controls sit around it.",
};

/** docs/SPEC-MARKETING.md §M10.6. */
export default function SecurityPage() {
  return (
    <DocPage
      title="Security Practices"
      intro="How the service is hosted, how customer code is handled, and the controls and audits around both."
      sections={getLegalSections("security")}
    />
  );
}
