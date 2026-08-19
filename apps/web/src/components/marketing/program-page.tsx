import { Check } from "lucide-react";

import { Lissajous } from "./figures";
import {
  ChamferLink,
  Container,
  CtaBand,
  DisplayHeading,
  Eyebrow,
  GridBackdrop,
  HatchFrame,
  MonoLabel,
  PosterHeading,
  Section,
  SectionRule,
} from "./ui";

/**
 * The single-purpose program pages — /open-source, /startup-discount, /yc.
 * docs/SPEC-MARKETING.md §M10.9.
 */
export function ProgramPage({
  eyebrow,
  title,
  dek,
  eligibility,
  steps,
  cta = { label: "Apply now", href: "/contact" },
  closing,
}: {
  eyebrow: string;
  title: string;
  dek: string;
  eligibility: string[];
  steps: { title: string; body: string }[];
  cta?: { label: string; href: string };
  closing: string;
}) {
  return (
    <>
      <Section grid={false} className="border-b border-current/10">
        <GridBackdrop variant="both" />
        <div className="pointer-events-none absolute inset-0 opacity-35" aria-hidden>
          <Lissajous seed={`program-${title}`} className="h-full w-full" />
        </div>
        <Container>
          <div className="relative py-24 text-center">
            <Eyebrow className="pb-6">{eyebrow}</Eyebrow>
            <PosterHeading>{title}</PosterHeading>
            <p className="mx-auto max-w-2xl pt-8 text-lg leading-relaxed opacity-75">
              {dek}
            </p>
            <div className="flex justify-center pt-10">
              <ChamferLink href={cta.href} tone="green">
                {cta.label}
              </ChamferLink>
            </div>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="grid gap-12 py-20 lg:grid-cols-2">
            <HatchFrame inset="p-8">
              <MonoLabel className="block pb-6 opacity-55">
                Who qualifies
              </MonoLabel>
              <ul className="space-y-4">
                {eligibility.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-3 text-[15px] leading-relaxed opacity-80"
                  >
                    <Check
                      size={15}
                      aria-hidden
                      className="mt-1 shrink-0 text-mkt-green"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </HatchFrame>

            <div>
              <MonoLabel className="block pb-6 opacity-55">
                How it works
              </MonoLabel>
              <ol className="space-y-8">
                {steps.map((step, i) => (
                  <li key={step.title} className="border-t border-current/12 pt-5">
                    <MonoLabel className="block pb-2 opacity-45">
                      {String(i + 1).padStart(2, "0")}
                    </MonoLabel>
                    <DisplayHeading as="h2" size="sm">
                      {step.title}
                    </DisplayHeading>
                    <p className="pt-2 text-sm leading-relaxed opacity-70">
                      {step.body}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <SectionRule>Terms apply, and we read every application</SectionRule>
        </Container>
      </Section>

      <CtaBand heading={closing} primary={cta} />
    </>
  );
}
