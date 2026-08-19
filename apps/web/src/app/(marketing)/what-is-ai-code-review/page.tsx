import type { Metadata } from "next";

import { Prose } from "@/components/marketing/blocks";
import { Figure } from "@/components/marketing/figures";
import {
  ChamferLink,
  Container,
  CtaBand,
  DisplayHeading,
  GridBackdrop,
  MonoLabel,
  Section,
  SectionRule,
} from "@/components/marketing/ui";
import type { Block } from "@/lib/marketing-types";
import { getFeaturePages } from "@/lib/data/marketing/queries";

export const metadata: Metadata = {
  title: "AI Code Review: the guide",
  description:
    "What AI code review is, how it works, where it helps, and how to evaluate one.",
};

/* Placeholder editorial written for this clone. §M12.3 */
const SECTIONS: { id: string; heading: string; body: Block[] }[] = [
  {
    id: "what",
    heading: "What is AI code review?",
    body: [
      {
        kind: "p",
        text: "AI code review is an automated reviewer that reads a proposed change in the context of the codebase around it, and comments where it believes something is wrong. The distinction that matters is context: a linter reasons about a file, a type checker reasons about a program's declarations, and a review agent reasons about intent — what this change is trying to do, and whether the rest of the repository agrees.",
      },
      {
        kind: "p",
        text: "That framing explains both what it is good at and what it is not. It will not replace tests, because it does not know what your software is supposed to do. It will not replace a human reviewer who cares about the design. What it does is catch the specific class of mistake that is invisible in a diff and obvious once you have read the four other files involved.",
      },
    ],
  },
  {
    id: "how",
    heading: "How do AI code reviews work?",
    body: [
      {
        kind: "p",
        text: "In broad strokes there are three stages, and tools differ mostly in how seriously they take the first one.",
      },
      {
        kind: "ol",
        items: [
          "Index. Build a representation of the repository — files, symbols, call edges, ownership, history. This is the expensive part, and it is what later stages spend.",
          "Reason. Walk outward from the changed lines through that representation, establishing what else is affected and whether the change is consistent with it.",
          "Report. Decide, per candidate finding, whether it is worth a human's attention — then write it with the evidence attached.",
        ],
      },
      {
        kind: "p",
        text: "The third stage is where most of the product is. Generating candidate findings is easy and generating too many is easier still.",
      },
    ],
  },
  {
    id: "example",
    heading: "What a good finding looks like",
    body: [
      {
        kind: "p",
        text: "A useful comment names the failure, not the smell. It says which input reaches the changed code, what happens when it does, and where the consequence lands — ideally with the two or three lines elsewhere in the repository that make it true. If a reviewer cannot produce that chain, the finding is a guess, and guesses are what erode trust in the tool.",
      },
      {
        kind: "quote",
        text: "A reviewer that comments on everything is indistinguishable from no reviewer at all after the second week, because people stop reading it.",
      },
    ],
  },
  {
    id: "buyers-guide",
    heading: "A buyer's guide",
    body: [
      {
        kind: "p",
        text: "Most evaluations go wrong by measuring the wrong axis. Some questions that separate tools quickly:",
      },
      {
        kind: "ul",
        items: [
          "How much of the repository does it read before commenting, and can you tell?",
          "What is its median comment count per pull request, on your code rather than a demo?",
          "Can it be told your standards in prose, scoped to the paths that need them?",
          "Does it get quieter as your team dismisses categories of finding?",
          "Can it run where your code is allowed to live?",
          "Is the reviewer independent of whatever wrote the code?",
        ],
      },
      {
        kind: "p",
        text: "Then run the only test that generalises: two weeks on one busy repository, and a count at the end of how many comments actually changed the code.",
      },
    ],
  },
  {
    id: "conclusion",
    heading: "Conclusion",
    body: [
      {
        kind: "p",
        text: "Generation got dramatically cheaper and validation did not. However much code your team produces, someone or something still has to decide whether it should be merged — and that decision is now the constraint. AI code review is one answer to that, and its quality is measured less by what it finds than by what it declines to say.",
      },
    ],
  },
];

/** docs/SPEC-MARKETING.md §M10.4. */
export default function WhatIsAiCodeReviewPage() {
  const features = getFeaturePages().slice(0, 3);

  return (
    <>
      <Section grid={false} className="border-b border-current/10">
        <GridBackdrop variant="both" />
        <Container>
          <div className="max-w-3xl py-20">
            <MonoLabel className="block pb-6 opacity-55">Guide</MonoLabel>
            <DisplayHeading as="h1" size="lg">
              AI Code Reviews: the guide
            </DisplayHeading>
            <p className="pt-6 text-lg leading-relaxed opacity-75">
              What it is, how it works, where it helps, and how to tell a useful
              one from a noisy one.
            </p>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="grid gap-12 py-16 lg:grid-cols-[minmax(0,0.28fr)_minmax(0,1fr)]">
            <nav
              aria-label="On this page"
              className="h-max lg:sticky lg:top-28"
            >
              <MonoLabel className="block pb-4 opacity-55">
                On this page
              </MonoLabel>
              <ul className="space-y-2 border-l border-current/15 pl-4">
                {SECTIONS.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="text-sm leading-snug opacity-65 transition-opacity hover:opacity-100"
                    >
                      {section.heading}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            <article className="max-w-3xl space-y-14">
              {SECTIONS.map((section) => (
                <section
                  key={section.id}
                  id={section.id}
                  className="scroll-mt-28"
                >
                  <DisplayHeading as="h2" size="sm">
                    {section.heading}
                  </DisplayHeading>
                  <div className="pt-4">
                    <Prose blocks={section.body} />
                  </div>
                </section>
              ))}

              <Figure
                variant="graph"
                seed="guide-figure"
                caption="fig 1. what a review reads before it comments"
              />

              <p className="text-xs leading-relaxed opacity-45">
                Placeholder editorial written for this clone — see
                docs/SPEC-MARKETING.md §M12.3.
              </p>
            </article>
          </div>
        </Container>
      </Section>

      <Section grid={false} className="border-t border-current/10">
        <Container>
          <SectionRule>Learn more about Greptile features</SectionRule>
          <div className="flex flex-wrap gap-4 py-14">
            {features.map((feature) => (
              <ChamferLink
                key={feature.slug}
                href={`/${feature.slug}`}
                tone="basalt"
              >
                {feature.title}
              </ChamferLink>
            ))}
          </div>
        </Container>
      </Section>

      <CtaBand heading="Sign up and point it at the repository you worry about." />
    </>
  );
}
