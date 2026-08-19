import type { Metadata } from "next";

import { DocPage } from "@/components/marketing/doc-page";
import { getLegalSections } from "@/lib/data/marketing/queries";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The agreement covering use of the service.",
};

/** docs/SPEC-MARKETING.md §M10.6. */
export default function TermsPage() {
  return (
    <DocPage
      title="Terms of Service"
      intro="The agreement that covers use of the service."
      sections={getLegalSections("terms")}
    />
  );
}
