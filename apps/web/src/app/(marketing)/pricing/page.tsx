import type { Metadata } from "next";
import { Check, Info } from "lucide-react";

import { Faq } from "@/components/marketing/accordion";
import {
  ChamferLink,
  Container,
  DisplayHeading,
  Eyebrow,
  GridBackdrop,
  HatchFrame,
  MonoLabel,
  PosterHeading,
  Section,
} from "@/components/marketing/ui";
import { getFaq, getPlans } from "@/lib/data/marketing/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Greptile Pricing — Free, Pro, and Enterprise Plans",
  description:
    "Starter is free for one active developer. Pro is $30 per seat per month. Enterprise is priced per organisation.",
};

/** docs/SPEC-MARKETING.md §M5. */
export default function PricingPage() {
  const plans = getPlans();

  return (
    <>
      <Section grid={false} className="border-b border-current/10">
        <GridBackdrop variant="both" />
        <Container>
          <div className="py-14">
            <HatchFrame inset="p-10 lg:p-16">
              <div className="text-center">
                <PosterHeading>Greptile Pricing</PosterHeading>
                <div className="flex justify-center pt-10">
                  <ChamferLink
                    href="https://app.greptile.com/signup"
                    tone="green"
                  >
                    Start 14 day free trial
                  </ChamferLink>
                </div>
              </div>
            </HatchFrame>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="grid divide-current/20 py-16 lg:grid-cols-3 lg:divide-x lg:[&>*]:border-dashed">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={cn(
                  "relative flex flex-col border-current/20 px-8 pt-12",
                  plan.recommended && "border-x border-dashed",
                )}
              >
                {plan.recommended ? (
                  <div className="absolute inset-x-0 top-0 bg-mkt-green py-1.5 text-center">
                    <MonoLabel className="text-mkt-basalt">
                      Recommended
                    </MonoLabel>
                  </div>
                ) : null}

                <div className="text-center">
                  <DisplayHeading as="h2" size="sm" className="text-3xl">
                    {plan.name}
                  </DisplayHeading>
                  <p className="pt-3 text-sm opacity-70">{plan.blurb}</p>
                  <p className="flex items-center justify-center gap-1.5 pt-6 font-semibold">
                    <span className="text-lg">{plan.price}</span>
                    {plan.priceSuffix ? (
                      <span className="text-sm opacity-70">
                        {plan.priceSuffix}
                      </span>
                    ) : null}
                    {plan.priceNote ? (
                      <span
                        className="opacity-50"
                        title={plan.priceNote}
                        aria-label={plan.priceNote}
                      >
                        <Info size={14} />
                      </span>
                    ) : null}
                  </p>
                </div>

                <div className="flex justify-center border-y border-dashed border-current/20 py-8">
                  <ChamferLink
                    href={plan.ctaHref}
                    tone={plan.recommended ? "green" : "basalt"}
                  >
                    {plan.cta}
                  </ChamferLink>
                </div>

                <div className="flex-1 py-8">
                  <MonoLabel className="block pb-5 opacity-55">
                    What&apos;s included
                  </MonoLabel>
                  <ul className="space-y-3">
                    {plan.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-2.5 text-sm leading-relaxed opacity-80"
                      >
                        <Check
                          size={14}
                          aria-hidden
                          className="mt-1 shrink-0 text-mkt-green"
                        />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </Container>
      </Section>

      <Section grid={false} className="border-y border-current/10">
        <GridBackdrop />
        <Container>
          <div className="grid divide-current/15 py-20 lg:grid-cols-2 lg:divide-x">
            <ProgramCard
              eyebrow="Open source"
              heading="Free for OSS projects"
              body="Non-commercial projects under a permissive licence run on Greptile at no cost, with the same reviews paying teams get."
              cta="Apply for OSS"
              href="/open-source"
            />
            <ProgramCard
              eyebrow="Startups"
              heading="50% off for early-stage startups"
              body="Pre-Series A companies under a couple of million in trailing revenue pay half price, for as long as that stays true."
              cta="Apply for startup discount"
              href="/startup-discount"
              className="lg:pl-12"
            />
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <Faq items={getFaq("pricing")} />
        </Container>
      </Section>
    </>
  );
}

function ProgramCard({
  eyebrow,
  heading,
  body,
  cta,
  href,
  className,
}: {
  eyebrow: string;
  heading: string;
  body: string;
  cta: string;
  href: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-4 pr-8", className)}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <DisplayHeading size="md">{heading}</DisplayHeading>
      <p className="max-w-md text-base leading-relaxed opacity-75">{body}</p>
      <div className="pt-4">
        <ChamferLink href={href} tone="basalt">
          {cta}
        </ChamferLink>
      </div>
    </div>
  );
}
