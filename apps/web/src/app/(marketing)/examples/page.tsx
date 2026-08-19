import type { Metadata } from "next";

import {
  FindingCard,
  FindingRow,
  RepoHeader,
} from "@/components/marketing/blocks";
import {
  ChamferLink,
  ChamferPair,
  Container,
  CtaBand,
  Eyebrow,
  DisplayHeading,
  GridBackdrop,
  MonoLabel,
  PosterHeading,
  Section,
  SectionRule,
} from "@/components/marketing/ui";
import { Lissajous } from "@/components/marketing/figures";
import {
  getLiveFindings,
  getRepoGroups,
  getTrexFindings,
} from "@/lib/data/marketing/queries";

export const metadata: Metadata = {
  title: "Greptile in Action | Real Examples from Open Source Projects",
  description:
    "Real findings from busy open source repositories, in the shape the reviewer posted them.",
};

/** docs/SPEC-MARKETING.md §M6. */
export default function ExamplesPage() {
  const groups = getRepoGroups();
  const trex = getTrexFindings();
  const live = getLiveFindings();

  return (
    <>
      <Section grid={false} className="border-b border-current/10">
        <GridBackdrop variant="both" />
        <Container>
          <div className="mx-auto max-w-4xl py-24 text-center">
            <PosterHeading>Greptile in action.</PosterHeading>
            <p className="pt-8 text-lg opacity-75">
              Real findings from busy open source repositories, in the shape the
              reviewer posted them.
            </p>
          </div>
        </Container>
      </Section>

      <Section grid={false}>
        <Container>
          <SectionRule>Popular OS repos using Greptile</SectionRule>
        </Container>
        <div className="grid grid-cols-2 divide-x divide-y divide-current/10 border-y border-current/10 sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
          {groups.map((group) => (
            <div
              key={group.slug}
              className="flex flex-col items-center justify-center gap-2 px-4 py-8"
            >
              <span className="font-display text-base font-semibold opacity-45">
                {group.name}
              </span>
              <span className="flex flex-wrap justify-center gap-1">
                {group.tags.map((tag) => (
                  <MonoLabel
                    key={tag}
                    className="bg-current/[0.07] px-1.5 py-0.5 text-[9px] opacity-70"
                  >
                    {tag}
                  </MonoLabel>
                ))}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <Container>
          <div className="space-y-20 py-20">
            {groups.map((group) => (
              <div key={group.slug} className="space-y-8">
                <RepoHeader group={group} />
                <div className="grid gap-6 lg:grid-cols-3">
                  {group.findings.map((finding) => (
                    <FindingCard key={finding.id} finding={finding} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Container>
      </Section>

      <Section grid={false} className="border-y border-current/10">
        <div className="pointer-events-none absolute inset-0 opacity-40" aria-hidden>
          <Lissajous seed="examples-trex" className="h-full w-full" />
        </div>
        <Container>
          <div className="relative py-20">
            <div className="max-w-3xl space-y-4">
              <Eyebrow>Runtime</Eyebrow>
              <DisplayHeading size="lg">
                Bugs you only catch by running the code.
              </DisplayHeading>
              <p className="text-base leading-relaxed opacity-75">
                Some defects are invisible until the branch executes. TREX builds each
                pull request in a sandbox and goes looking for those.
              </p>
            </div>
            <div className="grid gap-x-12 pt-12 lg:grid-cols-2">
              {trex.map((finding) => (
                <FindingRow key={finding.id} finding={finding} />
              ))}
            </div>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="py-20">
            <div className="max-w-3xl space-y-4">
              <Eyebrow>Live</Eyebrow>
              <DisplayHeading size="lg">
                Catching bugs in real-time.
              </DisplayHeading>
              <p className="text-base leading-relaxed opacity-75">
                A rolling window of what Greptile is finding across open source
                repositories.
              </p>
            </div>
            <div className="grid gap-x-12 pt-12 lg:grid-cols-2">
              {live.map((finding) => (
                <FindingRow key={finding.id} finding={finding} />
              ))}
            </div>
            <div className="flex justify-center pt-12">
              <ChamferPair>
                <ChamferLink href="/customers" tone="basalt">
                  Read case studies
                </ChamferLink>
                <ChamferLink href="https://app.greptile.com/signup" tone="green">
                  Load more
                </ChamferLink>
              </ChamferPair>
            </div>
          </div>
        </Container>
      </Section>

      <CtaBand
        heading="See Greptile catch bugs in your codebase."
        secondary={{ label: "Book Demo", href: "/contact" }}
      />
    </>
  );
}
