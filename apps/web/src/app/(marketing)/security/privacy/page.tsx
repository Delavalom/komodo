import type { Metadata } from "next";

import { DocPage } from "@/components/marketing/doc-page";
import { getLegalSections } from "@/lib/data/marketing/queries";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What we collect, why, and what you can ask us to do about it.",
};

/** docs/SPEC-MARKETING.md §M10.6. */
export default function PrivacyPage() {
  return (
    <DocPage
      title="Privacy Policy"
      intro="What we collect, why we collect it, and what you can ask us to do about it."
      sections={getLegalSections("privacy")}
    />
  );
}
