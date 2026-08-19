import type { Metadata } from "next";

import { ProgramPage } from "@/components/marketing/program-page";

export const metadata: Metadata = {
  title: "For YC Companies",
  description: "Greptile for accelerator-backed teams.",
};

/** docs/SPEC-MARKETING.md §M10.9. */
export default function YcPage() {
  return (
    <ProgramPage
      eyebrow="Program"
      title="For YC Companies."
      dek="Accelerator-backed teams get an extended trial and founder pricing, because the first year is when review habits actually get set."
      eligibility={[
        "You are in a current or recent accelerator batch.",
        "You have a shared repository and more than one person committing to it.",
        "You would rather set the review bar now than retrofit it later.",
      ]}
      steps={[
        {
          title: "Verify the batch",
          body: "Tell us which batch you are in and we will confirm from our side.",
        },
        {
          title: "Extended trial",
          body: "Longer than the standard fourteen days, so you can judge it across a real sprint.",
        },
        {
          title: "Founder pricing",
          body: "Discounted seats that scale with the team rather than resetting when you grow.",
        },
      ]}
      cta={{ label: "Claim the offer", href: "/contact" }}
      closing="Set the review bar before the codebase sets it for you."
    />
  );
}
