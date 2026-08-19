import type { Metadata } from "next";
import Link from "next/link";

import {
  Container,
  CtaBand,
  DisplayHeading,
  GridBackdrop,
  MonoLabel,
  PosterHeading,
  Section,
} from "@/components/marketing/ui";
import { getJobsByTeam } from "@/lib/data/marketing/queries";

export const metadata: Metadata = {
  title: "Careers",
  description: "Open roles on the team building Greptile.",
};

/** docs/SPEC-MARKETING.md §M9.4. */
export default function CareersPage() {
  const groups = getJobsByTeam();

  return (
    <>
      <Section grid={false} className="border-b border-current/10">
        <GridBackdrop variant="both" />
        <Container>
          <div className="py-24 text-center">
            <PosterHeading>Work at Greptile.</PosterHeading>
            <p className="mx-auto max-w-2xl pt-8 text-lg opacity-75">
              Small team, large surface, short feedback loops. We work in person
              and ship most days.
            </p>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="py-16">
            <DisplayHeading size="md" className="pb-10">
              Open Positions
            </DisplayHeading>
            <div className="space-y-12">
              {groups.map((group) => (
                <div key={group.team}>
                  <MonoLabel className="block pb-4 opacity-55">
                    {group.team}
                  </MonoLabel>
                  <div className="border-t border-current/10">
                    {group.jobs.map((job) => (
                      <Link
                        key={job.slug}
                        href={`/careers/${job.slug}`}
                        className="group flex items-center justify-between gap-6 border-b border-current/10 py-5 transition-colors hover:bg-current/[0.04]"
                      >
                        <span className="font-display text-lg font-semibold">
                          {job.title}
                        </span>
                        <span className="flex items-center gap-6">
                          <MonoLabel className="hidden opacity-50 sm:block">
                            {job.location} · {job.type}
                          </MonoLabel>
                          <span
                            aria-hidden
                            className="opacity-40 transition-opacity group-hover:opacity-90"
                          >
                            →
                          </span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </Section>

      <CtaBand
        heading="Not sure which role fits? Send us something you built."
        primary={{ label: "Get in touch", href: "/contact" }}
        secondary={{ label: "Read the blog", href: "/blog" }}
      />
    </>
  );
}
