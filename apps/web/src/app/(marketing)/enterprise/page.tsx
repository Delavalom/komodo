import type { Metadata } from "next";

import { Faq } from "@/components/marketing/accordion";
import { FindingRow, PullQuote } from "@/components/marketing/blocks";
import { Contour, PixelWave, Wireframe } from "@/components/marketing/figures";
import {
  ChamferLink,
  ChamferPair,
  Container,
  CtaBand,
  DisplayHeading,
  GridBackdrop,
  MonoLabel,
  NumberedCard,
  Section,
  SectionIntro,
  SectionRule,
  StatBand,
} from "@/components/marketing/ui";
import {
  getFaq,
  getHeroQuote,
  getLiveFindings,
  getStatBand,
} from "@/lib/data/marketing/queries";

export const metadata: Metadata = {
  title: "Enterprise AI Code Review",
  description:
    "A consistent way for large engineering organisations to validate code across many repositories, tools and workflows.",
};

const SECURITY_CARDS = [
  {
    title: "Cloud or self hosted",
    body: "Run Greptile in our cloud, or deploy the whole system inside your own environment.",
  },
  {
    title: "Control where your code lives",
    body: "Keep review infrastructure inside whatever perimeter your data-residency rules require.",
  },
  {
    title: "Security built for your scale",
    body: "SOC 2, SSO and audit logging, with controls that survive a few thousand engineers.",
  },
];

const ADAPT_CARDS = [
  {
    title: ".greptile/",
    body: "Scope review settings, rules and context to the directories each team owns.",
  },
  {
    title: "Auto-indexed rules",
    body: "Existing rule files — AGENTS.md, CLAUDE.md, editor rule files — are read as context automatically.",
  },
  {
    title: "Learning",
    body: "Adapts to what your reviewers accept and reject, per team rather than per org.",
  },
  {
    title: "Full codebase context",
    body: "Complete context across the repository and the ones adjacent to it.",
  },
];

const WORKFLOW_CARDS = [
  {
    title: "Tight agent integrations",
    body: "Hand a finding to Codex, Claude Code, Cursor or Devin in one click, with the context and the suggested fix attached.",
  },
  {
    title: "Greptile MCP",
    body: "Read review comments, apply fixes and manage patterns from whichever agent you already use.",
  },
  {
    title: "Claude Code Plugin",
    body: "View and resolve comments without leaving the terminal.",
  },
  {
    title: "Model agnostic",
    body: "Routing picks the best available model per task, so reviews follow the frontier without a migration.",
  },
];

/** docs/SPEC-MARKETING.md §M7. */
export default function EnterprisePage() {
  const quote = getHeroQuote();
  const findings = getLiveFindings().slice(0, 7);

  return (
    <>
      <Section tone="dark" grid={false} className="border-b border-current/10">
        <GridBackdrop variant="cross" />
        <Container>
          <div className="grid items-center gap-12 py-24 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div>
              <DisplayHeading as="h1" size="lg" className="max-w-2xl">
                Improve code quality across your enterprise
              </DisplayHeading>
              <p className="max-w-2xl pt-6 text-lg leading-relaxed opacity-75">
                Greptile gives large engineering teams a consistent way to
                validate code across complex repositories, tools, and workflows.
              </p>
              <div className="pt-10">
                <ChamferPair>
                  <ChamferLink
                    href="https://app.greptile.com/signup"
                    tone="outline"
                  >
                    get started
                  </ChamferLink>
                  <ChamferLink href="/contact" tone="axolotl">
                    contact sales
                  </ChamferLink>
                </ChamferPair>
              </div>
              <MonoLabel className="mt-6 block opacity-55">
                no credit card required • 14-day free trial
              </MonoLabel>
            </div>

            <figure className="border border-white/15 p-4">
              <div className="aspect-[16/9] w-full overflow-hidden">
                <Wireframe seed="enterprise-hero" />
              </div>
              <figcaption className="pt-3">
                <MonoLabel className="opacity-50">
                  fig 1. enterprise code validation
                </MonoLabel>
              </figcaption>
            </figure>
          </div>
        </Container>
        <div className="text-mkt-ground/80">
          <PixelWave />
        </div>
      </Section>

      <Section grid={false}>
        <Container>
          <SectionRule>Over 22,000+ teams use Greptile</SectionRule>
        </Container>
      </Section>

      <Section>
        <Container>
          <SectionIntro
            heading="The complete validation layer for your team"
            lede="Greptile catches more because it both reads and runs your code, rather than picking one."
          />
          <div className="grid gap-8 pb-20 lg:grid-cols-2">
            {[
              {
                title: "AI Code Reviewer",
                body: "Reviews every pull request against full codebase context, so cross-file mistakes get caught before merge.",
                href: "/agent",
                figure: <Contour seed="ent-reviewer" />,
              },
              {
                title: "AI Runtime Validation",
                body: "Builds the branch in a sandbox and exercises it, catching the failures that static review cannot see.",
                href: "/trex",
                figure: <Wireframe seed="ent-runtime" />,
              },
            ].map((card) => (
              <div
                key={card.title}
                className="flex flex-col border border-current/12 p-6"
              >
                <div className="aspect-[16/9] w-full overflow-hidden border border-current/10">
                  {card.figure}
                </div>
                <DisplayHeading as="h3" size="sm" className="pt-6">
                  {card.title}
                </DisplayHeading>
                <p className="flex-1 pt-3 text-sm leading-relaxed opacity-75">
                  {card.body}
                </p>
                <div className="pt-6">
                  <ChamferLink href={card.href} tone="basalt">
                    Learn more
                  </ChamferLink>
                </div>
              </div>
            ))}
          </div>
        </Container>
      </Section>

      <Section grid={false} className="border-y border-current/10">
        <GridBackdrop />
        <Container>
          <SectionIntro
            eyebrow="Security"
            heading="Enterprise grade security"
            lede="SOC 2, with security and governance controls built in rather than bolted on."
            action={
              <ChamferLink href="/security" tone="basalt">
                Learn about security
              </ChamferLink>
            }
          />
          <div className="grid border-t border-current/10 sm:grid-cols-3">
            {SECURITY_CARDS.map((card, i) => (
              <NumberedCard
                key={card.title}
                index={i + 1}
                title={card.title}
                body={card.body}
              />
            ))}
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <SectionIntro
            heading="Code validation that adapts to every team"
            lede="Review configuration runs from the organisation down to the individual developer, so each team gets the review it actually wants."
            action={
              <ChamferLink href="/learning" tone="basalt">
                Learn more
              </ChamferLink>
            }
          />
          <SectionRule>Ways Greptile adapts to your team</SectionRule>
          <div className="grid pb-20 sm:grid-cols-2 lg:grid-cols-4">
            {ADAPT_CARDS.map((card, i) => (
              <NumberedCard
                key={card.title}
                index={i + 1}
                title={card.title}
                body={card.body}
              />
            ))}
          </div>
        </Container>
      </Section>

      <PullQuote
        quote={quote.quote}
        name={quote.name}
        role={`${quote.role} @ ${quote.company}`}
        monogram={quote.monogram}
      />

      <Section>
        <Container>
          <SectionIntro
            eyebrow="Independence"
            heading="Independent by design"
            lede="Greptile stays separate from any model, IDE or coding agent, so you are never locked into one ecosystem."
            action={
              <ChamferLink href="/independence" tone="basalt">
                Learn why it matters
              </ChamferLink>
            }
          />
          <SectionRule>Ways Greptile plugs into your workflow</SectionRule>
          <div className="grid pb-20 sm:grid-cols-2 lg:grid-cols-4">
            {WORKFLOW_CARDS.map((card, i) => (
              <NumberedCard
                key={card.title}
                index={i + 1}
                title={card.title}
                body={card.body}
              />
            ))}
          </div>
        </Container>
      </Section>

      <Section tone="dark" grid={false}>
        <GridBackdrop variant="cross" />
        <Container>
          <SectionIntro
            eyebrow="Live"
            heading="See what Greptile can catch."
            action={
              <ChamferLink href="/examples" tone="axolotl">
                See examples
              </ChamferLink>
            }
            className="[&_h2]:text-mkt-axolotl"
          />
          <StatBand stats={getStatBand()} className="border-y border-white/12" />
          <div className="grid gap-x-12 py-12 lg:grid-cols-2">
            {findings.map((finding) => (
              <FindingRow key={finding.id} finding={finding} />
            ))}
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <Faq items={getFaq("enterprise")} />
        </Container>
      </Section>

      <CtaBand
        heading="Ready to transform your enterprise development?"
        secondary={{ label: "View Pricing", href: "/pricing" }}
        primary={{ label: "Book Demo", href: "/contact" }}
      />
    </>
  );
}
