import type { ReactNode } from "react";

import type { LegalSection } from "@/lib/marketing-types";

import { Prose } from "./blocks";
import {
  Container,
  DisplayHeading,
  GridBackdrop,
  MonoLabel,
  Section,
} from "./ui";

/**
 * The document template — /security, /security/privacy, /terms-of-service.
 * docs/SPEC-MARKETING.md §M10.6.
 *
 * A `Quick Links` rail on the left, numbered prose sections on the right.
 */
export function DocPage({
  title,
  updated = "Updated 18 August 2026",
  intro,
  sections,
  children,
}: {
  title: string;
  updated?: string;
  intro?: string;
  sections: LegalSection[];
  children?: ReactNode;
}) {
  return (
    <>
      <Section grid={false} className="border-b border-current/10">
        <GridBackdrop variant="both" />
        <Container>
          <div className="max-w-3xl py-20">
            <DisplayHeading as="h1" size="lg">
              {title}
            </DisplayHeading>
            <MonoLabel className="mt-6 block opacity-50">{updated}</MonoLabel>
            {intro ? (
              <p className="pt-6 text-lg leading-relaxed opacity-75">{intro}</p>
            ) : null}
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="grid gap-12 py-16 lg:grid-cols-[minmax(0,0.28fr)_minmax(0,1fr)]">
            <nav aria-label="Quick links" className="h-max lg:sticky lg:top-28">
              <MonoLabel className="block pb-4 opacity-55">
                Quick Links
              </MonoLabel>
              <ul className="space-y-2 border-l border-current/15 pl-4">
                {sections.map((section) => (
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

            <div className="max-w-3xl space-y-14">
              {sections.map((section, i) => (
                <section key={section.id} id={section.id} className="scroll-mt-28">
                  <MonoLabel className="block pb-3 opacity-45">
                    {String(i + 1).padStart(2, "0")}
                  </MonoLabel>
                  <DisplayHeading as="h2" size="sm">
                    {section.heading}
                  </DisplayHeading>
                  <div className="pt-4">
                    <Prose blocks={section.body} />
                  </div>
                </section>
              ))}
              {children}
              <p className="text-xs leading-relaxed opacity-45">
                Placeholder document written for this clone — see
                docs/SPEC-MARKETING.md §M12.3. It is not legal text and should
                not be treated as any.
              </p>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
