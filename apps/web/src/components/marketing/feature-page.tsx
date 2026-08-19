import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Figure, PixelWave } from "./figures";
import {
  ChamferLink,
  ChamferPair,
  Container,
  CtaBand,
  DisplayHeading,
  Eyebrow,
  GridBackdrop,
  MonoLabel,
  Section,
  SectionRule,
} from "./ui";
import { getFeaturePage, getSiblingFeatures } from "@/lib/data/marketing/queries";
import { cn } from "@/lib/utils";

/**
 * One template, eight routes. docs/SPEC-MARKETING.md §M8.
 *
 * The slugs are separate static routes rather than a `[feature]` segment,
 * because a second root-level dynamic segment would collide with the app
 * clone's `[org]`.
 */
export function featureMetadata(slug: string): Metadata {
  const page = getFeaturePage(slug);
  if (!page) return {};
  return { title: page.metaTitle, description: page.metaDescription };
}

export function FeaturePageView({
  slug,
  extra,
}: {
  slug: string;
  /** Page-specific band rendered under the hero — the CLI tab strip, the
   *  partner grid. §M8. */
  extra?: ReactNode;
}) {
  const page = getFeaturePage(slug);
  if (!page) notFound();
  const siblings = getSiblingFeatures(slug);

  return (
    <>
      {/* §M8.1 — dark hero, hatch rail at the 65% column, pixel-wave edge. */}
      <Section tone="dark" grid={false}>
        <GridBackdrop variant="cross" />
        <span
          aria-hidden
          className="hatch pointer-events-none absolute inset-y-0 left-[65%] hidden w-10 opacity-60 lg:block"
        />
        <Container>
          <div className="relative max-w-3xl py-28">
            <DisplayHeading as="h1" size="lg">
              {page.heading}
            </DisplayHeading>
            <p className="max-w-2xl pt-6 text-lg leading-relaxed opacity-75">
              {page.dek}
            </p>
            <div className="pt-10">
              <ChamferPair>
                <ChamferLink href="/contact" tone="outline">
                  contact sales
                </ChamferLink>
                <ChamferLink
                  href="https://app.greptile.com/signup"
                  tone="axolotl"
                >
                  get started
                </ChamferLink>
              </ChamferPair>
            </div>
            <MonoLabel className="mt-6 block opacity-55">
              no credit card required • 14-day free trial
            </MonoLabel>
          </div>
        </Container>
        <div className="text-mkt-ground/80">
          <PixelWave />
        </div>
      </Section>

      {extra}

      {/* §M8.2 — alternating feature sections. */}
      {page.sections.map((section, i) => (
        <Section
          key={section.heading}
          grid={i % 2 === 1}
          className={cn(i % 2 === 1 && "border-y border-current/10")}
        >
          <Container>
            <div
              className={cn(
                "grid items-center gap-12 py-20 lg:grid-cols-2",
                section.flip && "lg:[&>*:first-child]:order-2",
              )}
            >
              <div className="space-y-4">
                <Eyebrow>{section.eyebrow.replace(/^\[\s*|\s*\]$/g, "")}</Eyebrow>
                <DisplayHeading size="md">{section.heading}</DisplayHeading>
                <p className="max-w-xl text-base leading-relaxed opacity-75">
                  {section.body}
                </p>
                {section.linkLabel && section.linkHref ? (
                  <div className="pt-4">
                    <ChamferLink href={section.linkHref} tone="basalt">
                      {section.linkLabel}
                    </ChamferLink>
                  </div>
                ) : null}
              </div>
              <Figure
                variant={section.figure}
                seed={`${slug}-${i}`}
                caption={`fig ${i + 1}. ${section.heading.toLowerCase()}`}
              />
            </div>
          </Container>
        </Section>
      ))}

      {/* §M8.3 — cross-links to sibling feature pages. */}
      <Section>
        <Container>
          <SectionRule>Explore other features at Greptile</SectionRule>
          <div className="grid gap-6 py-14 lg:grid-cols-3">
            {siblings.map((sibling) => (
              <Link
                key={sibling.slug}
                href={`/${sibling.slug}`}
                className="group flex flex-col gap-3 border border-current/12 p-6 transition-colors hover:bg-current/[0.04]"
              >
                <MonoLabel className="opacity-55">{sibling.title}</MonoLabel>
                <DisplayHeading as="h3" size="sm">
                  {sibling.heading}
                </DisplayHeading>
                <p className="flex-1 text-sm leading-relaxed opacity-70">
                  {sibling.dek}
                </p>
                <span className="font-label text-[11px] uppercase tracking-[0.18em] opacity-60 transition-opacity group-hover:opacity-100">
                  Learn more <span aria-hidden>→</span>
                </span>
              </Link>
            ))}
          </div>
        </Container>
      </Section>

      <CtaBand heading={page.metaDescription} />
    </>
  );
}
