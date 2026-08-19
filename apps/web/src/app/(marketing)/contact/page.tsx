import type { Metadata } from "next";

import { ContactForm } from "@/components/marketing/contact-form";
import {
  Container,
  GridBackdrop,
  HatchFrame,
  PosterHeading,
  Section,
} from "@/components/marketing/ui";

export const metadata: Metadata = {
  title: "Contact Sales — Book a demo of Greptile",
  description: "Tell us about your team and we will get back to you.",
};

/** docs/SPEC-MARKETING.md §M10.1. */
export default function ContactPage() {
  return (
    <>
      <Section grid={false} className="border-b border-current/10">
        <GridBackdrop variant="both" />
        <Container>
          <div className="py-14">
            <HatchFrame inset="p-10 lg:p-16">
              <div className="relative text-center">
                <span
                  aria-hidden
                  className="dither absolute inset-0 text-mkt-green opacity-25"
                />
                <div className="relative">
                  <PosterHeading>Contact Sales.</PosterHeading>
                  <p className="mx-auto max-w-2xl pt-8 text-lg opacity-75">
                    Tell us about your team and what you are trying to fix, and
                    the right person will reply.
                  </p>
                </div>
              </div>
            </HatchFrame>
          </div>
        </Container>
      </Section>

      <ContactForm />
    </>
  );
}
