import type { Metadata } from "next";

import { ProgramPage } from "@/components/marketing/program-page";

export const metadata: Metadata = {
  title: "Open Source Program",
  description: "Free Greptile for qualified open source projects.",
};

/** docs/SPEC-MARKETING.md §M10.9. */
export default function OpenSourcePage() {
  return (
    <ProgramPage
      eyebrow="Program"
      title="Open Source Program."
      dek="Non-commercial projects under a permissive licence run on Greptile at no cost, with the same reviews paying teams get."
      eligibility={[
        "The project is licensed permissively — MIT, Apache 2.0 or similar.",
        "It is not a commercial product with an open core.",
        "The repository is public and takes outside contributions.",
        "A maintainer is willing to be the point of contact.",
      ]}
      steps={[
        {
          title: "Tell us about the project",
          body: "A link to the repository and a sentence about who maintains it is enough to start.",
        },
        {
          title: "We check eligibility",
          body: "Usually same week. If it is borderline we will say so rather than going quiet.",
        },
        {
          title: "Install and forget about it",
          body: "Reviews start on the next pull request. Nothing to configure unless you want to.",
        },
      ]}
      cta={{ label: "Apply for OSS", href: "/contact" }}
      closing="Free for the projects everything else is built on."
    />
  );
}
