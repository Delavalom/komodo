import type { Metadata } from "next";

import { ProgramPage } from "@/components/marketing/program-page";

export const metadata: Metadata = {
  title: "TREX Bone Giveaway",
  description: "A small thing for teams that ship with TREX.",
};

/** docs/SPEC-MARKETING.md §M10.12. */
export default function TrexGiveawayPage() {
  return (
    <ProgramPage
      eyebrow="Giveaway"
      title="TREX Bone Giveaway."
      dek="Run TREX on a real repository, tell us the strangest thing it caught, and we will send you something for the desk."
      eligibility={[
        "TREX has run on at least one pull request in a repository you work on.",
        "You are willing to describe the finding in a sentence or two.",
        "You have a shipping address in a country we can post to.",
      ]}
      steps={[
        {
          title: "Run it",
          body: "Turn TREX on for one repository and let it work through a week of pull requests.",
        },
        {
          title: "Tell us what it found",
          body: "The oddest, most specific, least expected finding. Screenshots welcome.",
        },
        {
          title: "We post it",
          body: "Entries close at the end of the month and everything ships the week after.",
        },
      ]}
      cta={{ label: "Enter the giveaway", href: "/contact" }}
      closing="Give the reptile something to chew on."
    />
  );
}
