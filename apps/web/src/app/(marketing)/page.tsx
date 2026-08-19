import type { Metadata } from "next";
import Link from "next/link";

import { Faq } from "@/components/marketing/accordion";
import {
  FindingCard,
  LogoWall,
  PullQuote,
  RepoHeader,
  TestimonialCard,
} from "@/components/marketing/blocks";
import {
  Contour,
  DiffFigure,
  DitherField,
  Lissajous,
  NodeGraph,
  Wireframe,
} from "@/components/marketing/figures";
import {
  ChamferLink,
  ChamferPair,
  Container,
  CtaBand,
  DisplayHeading,
  Eyebrow,
  GridBackdrop,
  HatchFrame,
  Marquee,
  MonoLabel,
  NumberedCard,
  Section,
  SectionIntro,
  SectionRule,
} from "@/components/marketing/ui";
import {
  getFaq,
  getHeroQuote,
  getHomeFindings,
  getLogoWall,
  getTestimonials,
} from "@/lib/data/marketing/queries";

export const metadata: Metadata = {
  title: "AI Code Review | Greptile | Merge 4X Faster, Catch 3X More Bugs",
  description:
    "AI agents that review and test pull requests with full context of the codebase.",
};

/** docs/SPEC-MARKETING.md §M4 — twelve bands, in order. */
export default function HomePage() {
  const quote = getHeroQuote();
  const repoGroups = getHomeFindings();
  const testimonials = getTestimonials();

  return (
    <>
      <Hero />
      <LogoBand />
      <PullQuote
        quote={quote.quote}
        name={quote.name}
        role={`${quote.role} @ ${quote.company}`}
        monogram={quote.monogram}
      />
      <HowItWorks />
      <CatchThemAll groups={repoGroups} />
      <Personalization />
      <ValidationLayer />
      <TrexBand />
      <SecurityBand />
      <Testimonials testimonials={testimonials} />
      <Section>
        <Container>
          <Faq items={getFaq("home")} />
        </Container>
      </Section>
      <CtaBand
        heading="Greptile is building the code validation layer so you can get back to shipping."
        figure={<ReviewThreadFigure />}
      />
    </>
  );
}

/* ── M§4.1 hero ────────────────────────────────────────────────────── */

function Hero() {
  return (
    <Section className="border-b border-current/10">
      <Container>
        <div className="grid items-center gap-10 py-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:py-28">
          <div>
            <h1 className="font-display text-[clamp(3rem,8.5vw,6rem)] font-extrabold leading-[0.98] tracking-[-0.025em]">
              The AI Code
              <br />
              Reviewer.
            </h1>

            <p className="max-w-md pt-12 text-lg leading-relaxed opacity-80">
              AI agents that review and test pull requests with full context of
              the codebase.
            </p>

            <div className="pt-8">
              <ChamferPair>
                <ChamferLink href="/contact" tone="basalt">
                  Contact Sales
                </ChamferLink>
                <ChamferLink
                  href="https://app.greptile.com/signup"
                  tone="green"
                >
                  Start now
                </ChamferLink>
              </ChamferPair>
            </div>

            <a
              href="https://www.greptile.com/docs/code-review/cli-onboarding"
              className="mt-6 inline-block font-label text-[13px] underline underline-offset-4 opacity-75 transition-opacity hover:opacity-100"
            >
              onboard with your agent <span aria-hidden>→</span>
            </a>
          </div>

          {/* The original's dithered iguana portrait. §M12.3 */}
          <div className="relative mx-auto w-full max-w-md">
            <div className="absolute -top-6 left-8 h-10 w-14 opacity-70">
              <DitherField seed="fly" glow="transparent" />
            </div>
            <DitherField seed="iguana" />
          </div>
        </div>
      </Container>
    </Section>
  );
}

/* ── M§4.2 logo wall ───────────────────────────────────────────────── */

function LogoBand() {
  return (
    <Section grid={false}>
      <Container>
        <SectionRule>Over 22,000+ teams use Greptile</SectionRule>
      </Container>
      <LogoWall names={getLogoWall()} />
    </Section>
  );
}

/* ── M§4.4 how it works ────────────────────────────────────────────── */

const STEPS = [
  {
    title: "Indexes your codebase",
    body: "Builds a graph of your repo — files, functions, and dependencies.",
    figure: <NodeGraph seed="step-1" />,
  },
  {
    title: "Swarm of agents review the PR",
    body: "Parallel agents review changes, assess their impact beyond the diff, and flag issues.",
    figure: <Wireframe seed="step-2" />,
  },
  {
    title: "Greptile learns your codebase over time",
    body: "Reads other engineers' comments to understand your coding standards.",
    figure: <Contour seed="step-3" />,
  },
];

function HowItWorks() {
  return (
    <Section tone="dark">
      <Container>
        <SectionIntro
          eyebrow="AGENT"
          heading="How Greptile reviews every PR"
          lede="Greptile constructs a graph index of your codebase, then uses a swarm of agents to catch potential issues that humans might miss."
          action={
            <ChamferLink href="/agent" tone="axolotl">
              Learn more
            </ChamferLink>
          }
          className="[&_h2]:text-mkt-axolotl"
        />
        <SectionRule>How it works</SectionRule>

        <div className="grid gap-8 py-14 lg:grid-cols-3">
          {STEPS.map((step, i) => (
            <HatchFrame key={step.title}>
              <div className="aspect-[4/3] w-full overflow-hidden bg-white/[0.04]">
                {step.figure}
              </div>
              <div className="space-y-2 px-2 pb-2 pt-6">
                <MonoLabel className="opacity-55">
                  Step {String(i + 1).padStart(2, "0")}
                </MonoLabel>
                <DisplayHeading as="h3" size="sm">
                  {step.title}
                </DisplayHeading>
                <p className="text-sm leading-relaxed opacity-70">{step.body}</p>
              </div>
            </HatchFrame>
          ))}
        </div>
      </Container>
    </Section>
  );
}

/* ── M§4.5 catch them all ──────────────────────────────────────────── */

function CatchThemAll({ groups }: { groups: ReturnType<typeof getHomeFindings> }) {
  return (
    <Section tone="dark" grid={false}>
      <GridBackdrop variant="cross" />
      <Container>
        <SectionIntro
          heading="Catch them all"
          lede="From style violations to security risks and multi-file logical bugs."
          align="center"
          className="[&_h2]:text-mkt-axolotl"
        />
        <SectionRule>Three bugs that should not hit prod.</SectionRule>

        <div className="grid gap-8 py-14 lg:grid-cols-3">
          {groups.map((group) => (
            <div key={group.slug} className="space-y-6">
              <RepoHeader group={group} />
              {group.findings[0] ? (
                <FindingCard finding={group.findings[0]} />
              ) : null}
            </div>
          ))}
        </div>

        <div className="flex justify-center pb-20">
          <ChamferLink href="/examples" tone="axolotl">
            See more examples
          </ChamferLink>
        </div>
      </Container>
    </Section>
  );
}

/* ── M§4.6 personalization ─────────────────────────────────────────── */

function Personalization() {
  return (
    <Section>
      <Container>
        <SectionIntro
          eyebrow="PERSONALIZATION"
          heading="Reviews that adapt to your team"
          lede="From custom rules to continuous learning, Greptile gets smarter about your codebase with every review."
          align="center"
        />

        <div className="grid gap-8 pb-24 lg:grid-cols-2">
          {[
            {
              label: "Custom rules",
              title: "Your house, your rules",
              body: "Write standards in plain English, point Greptile at repo-specific context, and enforce the patterns your team actually cares about on every PR.",
              cta: "Set your rules",
              href: "/learning",
              figure: <Wireframe seed="rules" />,
            },
            {
              label: "Learning",
              title: "We're getting to know each other",
              body: "Greptile learns your codebase and coding standards by reading your team's PR comments.",
              cta: "See learning",
              href: "/learning",
              figure: <Contour seed="learning" />,
            },
          ].map((card) => (
            <HatchFrame key={card.title}>
              <div className="aspect-[16/10] w-full overflow-hidden bg-current/[0.04]">
                {card.figure}
              </div>
              <div className="space-y-3 px-2 pb-2 pt-6">
                <Eyebrow>{card.label}</Eyebrow>
                <DisplayHeading as="h3" size="sm">
                  {card.title}
                </DisplayHeading>
                <p className="text-sm leading-relaxed opacity-70">{card.body}</p>
                <div className="pt-3">
                  <ChamferLink href={card.href} tone="basalt">
                    {card.cta}
                  </ChamferLink>
                </div>
              </div>
            </HatchFrame>
          ))}
        </div>
      </Container>
    </Section>
  );
}

/* ── M§4.7 central validation layer ────────────────────────────────── */

const PLUGS = [
  {
    title: "Fix in your IDE",
    body: "One-click send issue context to Claude Code, Cursor, Codex, or Devin.",
    figure: <DiffFigure seed="plug-1" rows={6} />,
  },
  {
    title: "Greptile MCP",
    body: "Connect Greptile to any AI agent to share comment context.",
    figure: <NodeGraph seed="plug-2" />,
  },
  {
    title: "Claude Code Plugin",
    body: "Let Claude Code automatically read and resolve Greptile comments.",
    figure: <Wireframe seed="plug-3" />,
  },
  {
    title: "/greploop",
    body: "Let any coding agent iterate with Greptile until all issues are resolved.",
    figure: <Contour seed="plug-4" />,
  },
];

function ValidationLayer() {
  return (
    <Section grid={false} className="border-y border-current/10">
      <GridBackdrop variant="both" />
      <Container>
        <SectionIntro
          eyebrow="YOUR STACK"
          heading="The Central Validation Layer."
          lede="Designed to work seamlessly with every coding agent, Greptile serves as the unified validation agent for all code changes."
          action={
            <ChamferLink href="/independence" tone="basalt">
              Learn more
            </ChamferLink>
          }
        />
        <SectionRule>Ways Greptile plugs into your workflow</SectionRule>

        <div className="grid gap-0 py-14 sm:grid-cols-2 lg:grid-cols-4">
          {PLUGS.map((plug, i) => (
            <NumberedCard key={plug.title} index={i + 1} title={plug.title} body={plug.body}>
              <div className="mb-4 aspect-[4/3] w-full overflow-hidden border border-current/12 bg-current/[0.03]">
                {plug.figure}
              </div>
            </NumberedCard>
          ))}
        </div>
      </Container>
    </Section>
  );
}

/* ── M§4.8 TREX ────────────────────────────────────────────────────── */

function TrexBand() {
  return (
    <Section grid={false}>
      <Marquee text="Test · Run · Execute" />
      <div className="relative">
        <div className="pointer-events-none absolute inset-0 opacity-70" aria-hidden>
          <Contour seed="trex-band" className="h-full w-full" />
        </div>
        <Container>
          <div className="relative mx-auto max-w-3xl py-24 text-center">
            <Eyebrow className="justify-center">Introducing TREX</Eyebrow>
            <DisplayHeading size="lg" className="pt-4">
              Autonomously Test Every PR
            </DisplayHeading>
            <p className="mx-auto max-w-2xl pt-4 text-base leading-relaxed opacity-75">
              TREX is a Greptile agent that writes and runs tests for every PR
              in a sandbox to catch bugs and missed edge cases.
            </p>
            <div className="flex justify-center pt-8">
              <ChamferLink href="/trex" tone="basalt">
                Get early access
              </ChamferLink>
            </div>
          </div>
        </Container>
      </div>
      <Marquee text="Test · Run · Execute" reverse />
    </Section>
  );
}

/* ── M§4.9 security ────────────────────────────────────────────────── */

const SECURITY_CARDS = [
  {
    title: "Self-Hosted Deployment",
    body: "Host Greptile in your own air-gapped environment.",
  },
  {
    title: "SOC 2 Compliance",
    body: "Independent audits, reports available on request.",
  },
  {
    title: "Enterprise Ready",
    body: "SSO, audit logs, dedicated support.",
  },
];

function SecurityBand() {
  return (
    <Section>
      <Container>
        <SectionIntro
          heading="Security-First Design"
          lede="Built for enterprises across defense, healthcare, and financial services."
          action={
            <ChamferLink href="/security" tone="basalt">
              Learn more
            </ChamferLink>
          }
        />
        <div className="grid border-y border-current/10 pb-0 sm:grid-cols-3">
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
  );
}

/* ── M§4.10 testimonials ───────────────────────────────────────────── */

function Testimonials({
  testimonials,
}: {
  testimonials: ReturnType<typeof getTestimonials>;
}) {
  return (
    <Section>
      <Container>
        <div className="grid gap-6 py-24 lg:grid-cols-3">
          <div className="space-y-6">
            <TestimonialCard testimonial={testimonials[0]} />
            <div className="relative h-56 border border-current/10">
              <Lissajous seed="tm-a" className="h-full w-full" />
            </div>
          </div>
          <div className="space-y-6">
            <TestimonialCard testimonial={testimonials[1]} />
            <TestimonialCard testimonial={testimonials[2]} />
          </div>
          <div className="space-y-6">
            <div className="relative flex h-56 flex-col items-center justify-center gap-4 border border-current/10">
              <Lissajous
                seed="tm-b"
                className="absolute inset-0 h-full w-full opacity-70"
              />
              <p className="relative text-center font-display text-sm opacity-70">
                See what our customers are saying
              </p>
              <Link
                href="/customers"
                className="relative font-label text-[11px] uppercase tracking-[0.18em] underline underline-offset-4"
              >
                View testimonials
              </Link>
            </div>
            <TestimonialCard testimonial={testimonials[3]} />
            <TestimonialCard testimonial={testimonials[4]} />
          </div>
        </div>
      </Container>
    </Section>
  );
}

/* ── M§4.12 closing figure ─────────────────────────────────────────── */

function ReviewThreadFigure() {
  return (
    <div className="w-full max-w-md border border-white/15 bg-white/[0.05] p-4">
      <MonoLabel className="opacity-55">auth.tsx</MonoLabel>
      <div className="pt-3">
        <DiffFigure seed="cta-thread" rows={4} className="bg-transparent" />
      </div>
      <div className="mt-4 space-y-3 border-t border-white/15 pt-4">
        <div className="flex items-center gap-2">
          <span aria-hidden className="h-3 w-3 bg-mkt-green" />
          <MonoLabel className="opacity-70">greptile</MonoLabel>
          <MonoLabel className="opacity-40">2 weeks ago</MonoLabel>
        </div>
        <p className="text-sm leading-relaxed opacity-80">
          Accounts created through OAuth do not populate a profile until the
          first login.
        </p>
        <div className="flex items-center gap-2 pt-1">
          <span aria-hidden className="h-3 w-3 bg-mkt-orchid" />
          <MonoLabel className="opacity-70">reviewer</MonoLabel>
        </div>
        <p className="text-sm opacity-70">Thanks greptile!</p>
      </div>
    </div>
  );
}
