import type { Metadata } from "next";

import { BenchmarkTable } from "@/components/marketing/charts";
import { FindingRow } from "@/components/marketing/blocks";
import {
  Container,
  CtaBand,
  DisplayHeading,
  GridBackdrop,
  PosterHeading,
  Section,
  SectionRule,
} from "@/components/marketing/ui";
import {
  getBenchmarkRows,
  getLiveFindings,
} from "@/lib/data/marketing/queries";

export const metadata: Metadata = {
  title: "AI Code Review Benchmarks",
  description:
    "How we measure review quality, and what the numbers look like across tools.",
};

const SECTIONS = [
  {
    id: "overview",
    heading: "Overview",
    body: "Two numbers decide whether a reviewer is worth keeping: how many real defects it finds, and how much it says while finding them. A tool that comments on everything scores well on the first and gets switched off inside a fortnight because of the second, so we report them together and never one without the other.",
  },
  {
    id: "methodology",
    heading: "Methodology",
    body: "A fixed corpus of merged pull requests with known defects is replayed through each tool at default settings, on the same repositories, with the same context available. Findings are graded blind by two reviewers, and a third breaks ties. Comment counts are taken from the raw output rather than from what survives triage.",
  },
];

/** docs/SPEC-MARKETING.md §M10.2. */
export default function BenchmarksPage() {
  return (
    <>
      <Section grid={false} className="border-b border-current/10">
        <GridBackdrop variant="both" />
        <Container>
          <div className="py-24 text-center">
            <PosterHeading>AI Code Review Benchmarks</PosterHeading>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="mx-auto max-w-3xl space-y-12 py-16">
            {SECTIONS.map((section) => (
              <section key={section.id} id={section.id}>
                <DisplayHeading as="h2" size="sm">
                  {section.heading}
                </DisplayHeading>
                <p className="pt-4 text-[15px] leading-relaxed opacity-80">
                  {section.body}
                </p>
              </section>
            ))}
          </div>
        </Container>
      </Section>

      <Section grid={false} className="border-y border-current/10">
        <Container>
          <div className="py-16">
            <DisplayHeading size="md" className="pb-8">
              Bug catch performance
            </DisplayHeading>
            <BenchmarkTable rows={getBenchmarkRows()} />
            <p className="pt-6 text-xs leading-relaxed opacity-45">
              Invented figures — see docs/SPEC-MARKETING.md §M12.3. These are
              not measurements of any real product.
            </p>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <SectionRule>Case library</SectionRule>
          <div className="grid gap-x-12 py-14 lg:grid-cols-2">
            {getLiveFindings().map((finding) => (
              <FindingRow key={finding.id} finding={finding} />
            ))}
          </div>
        </Container>
      </Section>

      <CtaBand heading="The only benchmark that matters is a week on your own repository." />
    </>
  );
}
