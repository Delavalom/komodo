import { ChartPanel } from "./charts";
import {
  ChamferLink,
  Container,
  CtaBand,
  DisplayHeading,
  Eyebrow,
  GridBackdrop,
  MonoLabel,
  PosterHeading,
  Section,
  SectionRule,
  StatBand,
} from "./ui";
import { getLeaderboard } from "@/lib/data/marketing/queries";

/**
 * The report landing — /state-of-ai-coding and its /reports/ alias.
 * docs/SPEC-MARKETING.md §M10.11.
 *
 * Every figure below is seeded rather than measured (§M12.3).
 */
const HEADLINES = [
  { value: "62%", label: "of PRs had agent involvement" },
  { value: "2.4×", label: "more changes per engineer" },
  { value: "1.9×", label: "revert rate on agent-authored PRs" },
  { value: "31%", label: "of review time spent on generated code" },
];

const FINDINGS = [
  {
    title: "Volume moved first, quality followed later",
    body: "Teams saw output climb within a quarter of adopting an agent, and defect rates stayed flat for roughly two more before drifting. The lag is the dangerous part: by the time the quality signal arrives, the habit is established.",
  },
  {
    title: "The failures cluster, they do not spread evenly",
    body: "Agent-authored changes fail in a narrow band — contract mismatches, resource lifetimes, and assumptions about code the author never read. They rarely fail on syntax or local logic, which is precisely what most tooling checks.",
  },
  {
    title: "Review became the constraint",
    body: "Every team we looked at ended up bottlenecked on the same two or three people who had enough context to approve anything. Adding generation capacity made that worse rather than better.",
  },
  {
    title: "Small pull requests still win",
    body: "The relationship between size and revert rate held regardless of who or what wrote the change. Agents make it easy to produce large diffs, and large diffs remain the single best predictor of something going wrong.",
  },
];

export function ReportPage({ canonicalPath }: { canonicalPath: string }) {
  const panels = getLeaderboard().slice(0, 6);

  return (
    <>
      <Section tone="dark" grid={false} className="border-b border-current/10">
        <GridBackdrop variant="cross" />
        <Container>
          <div className="py-24 text-center">
            <Eyebrow className="pb-6">Report · 2026</Eyebrow>
            <PosterHeading className="text-mkt-pollen">
              State of AI Coding
            </PosterHeading>
            <p className="mx-auto max-w-2xl pt-8 text-lg leading-relaxed opacity-75">
              What changed once agents started writing a serious share of the
              code, and what it did to the review that follows.
            </p>
            <div className="flex justify-center pt-10">
              <ChamferLink href="/contact" tone="pollen">
                Get the full report
              </ChamferLink>
            </div>
          </div>
        </Container>
      </Section>

      <Section grid={false} className="border-b border-current/10">
        <Container>
          <StatBand stats={HEADLINES} />
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="py-16">
            <DisplayHeading size="md" className="pb-10">
              Headline findings
            </DisplayHeading>
            <div className="grid gap-8 lg:grid-cols-2">
              {FINDINGS.map((finding, i) => (
                <article
                  key={finding.title}
                  className="border-t border-current/12 pt-6"
                >
                  <MonoLabel className="block pb-3 opacity-45">
                    {String(i + 1).padStart(2, "0")}
                  </MonoLabel>
                  <DisplayHeading as="h3" size="sm">
                    {finding.title}
                  </DisplayHeading>
                  <p className="pt-3 text-[15px] leading-relaxed opacity-75">
                    {finding.body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </Container>
      </Section>

      <Section grid={false} className="border-y border-current/10">
        <Container>
          <SectionRule>The data</SectionRule>
          <div className="grid gap-6 py-14 lg:grid-cols-3">
            {panels.map((panel) => (
              <ChartPanel key={panel.title} panel={panel} />
            ))}
          </div>
          <p className="pb-14 text-xs leading-relaxed opacity-45">
            Every series here is seeded, not measured — see
            docs/SPEC-MARKETING.md §M12.3. Canonical path for this report in the
            original is <code>{canonicalPath}</code>.
          </p>
        </Container>
      </Section>

      <CtaBand heading="Generation got cheap. Validation is what you are short of." />
    </>
  );
}
