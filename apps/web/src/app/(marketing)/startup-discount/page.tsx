import type { Metadata } from "next";

import { ProgramPage } from "@/components/marketing/program-page";

export const metadata: Metadata = {
  title: "Startup Discount",
  description: "Half price Greptile for early-stage startups.",
};

/** docs/SPEC-MARKETING.md §M10.9. */
export default function StartupDiscountPage() {
  return (
    <ProgramPage
      eyebrow="Program"
      title="Startup Discount."
      dek="Pre-Series A companies under a couple of million in trailing revenue pay half price, for as long as that stays true."
      eligibility={[
        "You have not raised a Series A.",
        "Trailing twelve-month revenue is under $2M.",
        "Fewer than fifty engineers on the team.",
        "You are paying out of a real budget rather than extending a trial.",
      ]}
      steps={[
        {
          title: "Apply",
          body: "Company name, stage and rough headcount. We do not need a data room.",
        },
        {
          title: "We confirm",
          body: "A short check, then the discount lands on your existing workspace.",
        },
        {
          title: "It rides with you",
          body: "The rate holds until you raise or outgrow the thresholds, and we tell you before it changes.",
        },
      ]}
      cta={{ label: "Apply for the discount", href: "/contact" }}
      closing="Half price while it matters most."
    />
  );
}
