import type { Metadata } from "next";
import Link from "next/link";

import {
  Container,
  DisplayHeading,
  GridBackdrop,
  MarkGlyph,
  MonoLabel,
  Section,
  Wordmark,
} from "@/components/marketing/ui";
import { getBrandFonts, getBrandPalette } from "@/lib/data/marketing/queries";

export const metadata: Metadata = {
  title: "Brand Guidelines — logos, colors, and typography",
  description:
    "The logo marks, colour palette and type stack this site is built from.",
};

const CONTENTS = [
  { id: "logos", label: "Logo Downloads" },
  { id: "mark", label: "Brand Mark / Avatar" },
  { id: "typography", label: "Typography" },
  { id: "colors", label: "Colors" },
];

const LOGO_VARIANTS = [
  { tone: "green" as const, name: "Green", note: "Use on dark backgrounds" },
  { tone: "basalt" as const, name: "Dark", note: "Use on light backgrounds" },
  { tone: "white" as const, name: "White", note: "Use on dark backgrounds" },
];

/**
 * docs/SPEC-MARKETING.md §M10.7.
 *
 * The page renders from the same token module the rest of the site uses, so a
 * palette change cannot leave the brand page describing the old one.
 */
export default function DesignPage() {
  const fonts = getBrandFonts();
  const palette = getBrandPalette();

  return (
    <>
      <Section grid={false} className="border-b border-current/10">
        <GridBackdrop variant="both" />
        <Container>
          <div className="max-w-3xl py-20">
            <DisplayHeading as="h1" size="lg">
              Greptile Brand Guidelines
            </DisplayHeading>
            <p className="pt-6 text-lg leading-relaxed opacity-75">
              The logo marks, colour palette and type stack this site is built
              from, for anyone representing the brand.
            </p>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="grid gap-12 py-16 lg:grid-cols-[minmax(0,0.28fr)_minmax(0,1fr)]">
            <nav aria-label="Contents" className="h-max lg:sticky lg:top-28">
              <MonoLabel className="block pb-4 opacity-55">Contents</MonoLabel>
              <ul className="space-y-2 border-l border-current/15 pl-4">
                {CONTENTS.map((entry) => (
                  <li key={entry.id}>
                    <a
                      href={`#${entry.id}`}
                      className="text-sm opacity-65 transition-opacity hover:opacity-100"
                    >
                      {entry.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="space-y-20">
              <section id="logos" className="scroll-mt-28">
                <DisplayHeading as="h2" size="sm">
                  Logo Downloads
                </DisplayHeading>
                <div className="grid gap-4 pt-6 sm:grid-cols-3">
                  {LOGO_VARIANTS.map((variant) => (
                    <div
                      key={variant.name}
                      className="border border-current/12 p-5"
                    >
                      <div
                        className={
                          variant.tone === "basalt"
                            ? "flex h-24 items-center justify-center bg-mkt-sandbank"
                            : "flex h-24 items-center justify-center bg-mkt-basalt"
                        }
                      >
                        <MarkGlyph tone={variant.tone} className="h-10 w-10" />
                      </div>
                      <MonoLabel className="mt-4 block">
                        Logo Mark ({variant.name})
                      </MonoLabel>
                      <MonoLabel className="mt-1 block text-[10px] opacity-50">
                        {variant.note}
                      </MonoLabel>
                    </div>
                  ))}
                </div>

                <div className="grid gap-4 pt-4 sm:grid-cols-3">
                  {LOGO_VARIANTS.map((variant) => (
                    <div
                      key={`wordmark-${variant.name}`}
                      className="border border-current/12 p-5"
                    >
                      <div
                        className={
                          variant.tone === "basalt"
                            ? "flex h-24 items-center justify-center overflow-hidden bg-mkt-sandbank"
                            : "flex h-24 items-center justify-center overflow-hidden bg-mkt-basalt"
                        }
                      >
                        <Wordmark tone={variant.tone} className="text-3xl" />
                      </div>
                      <MonoLabel className="mt-4 block">
                        Wordmark ({variant.name})
                      </MonoLabel>
                      <MonoLabel className="mt-1 block text-[10px] opacity-50">
                        {variant.note}
                      </MonoLabel>
                    </div>
                  ))}
                </div>
                <p className="pt-4 text-xs leading-relaxed opacity-45">
                  The marks are drawn inline as SVG rather than shipped as
                  downloadable files — this repo carries no binary assets
                  (docs/SPEC-MARKETING.md §M12.3).
                </p>
              </section>

              <section id="mark" className="scroll-mt-28">
                <DisplayHeading as="h2" size="sm">
                  Brand Mark / Avatar
                </DisplayHeading>
                <div className="mt-6 flex items-center gap-6 border border-current/12 p-8">
                  <span className="flex h-20 w-20 items-center justify-center bg-mkt-basalt">
                    <MarkGlyph tone="green" className="h-10 w-10" />
                  </span>
                  <span className="flex h-20 w-20 items-center justify-center bg-mkt-green">
                    <MarkGlyph tone="basalt" className="h-10 w-10" />
                  </span>
                  <p className="text-sm leading-relaxed opacity-70">
                    The isometric cube, square-cropped. Keep clear space equal
                    to half the mark on every side, and never rotate it.
                  </p>
                </div>
              </section>

              <section id="typography" className="scroll-mt-28">
                <DisplayHeading as="h2" size="sm">
                  Typography
                </DisplayHeading>
                <div className="space-y-4 pt-6">
                  {fonts.map((font) => (
                    <div
                      key={font.name}
                      className="border border-current/12 p-6"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-3">
                        <span className={`${font.className} text-2xl`}>
                          {font.name}
                        </span>
                        <MonoLabel className="opacity-50">
                          {font.token}
                        </MonoLabel>
                      </div>
                      <p className="pt-2 text-sm opacity-70">{font.role}</p>
                      <p
                        className={`${font.className} truncate pt-5 text-lg opacity-80`}
                      >
                        ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz
                        0123456789
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section id="colors" className="scroll-mt-28">
                <DisplayHeading as="h2" size="sm">
                  Colors
                </DisplayHeading>
                <div className="space-y-8 pt-6">
                  {palette.map((group) => (
                    <div key={group.group}>
                      <MonoLabel className="block pb-3 opacity-55">
                        {group.group}
                      </MonoLabel>
                      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                        {group.swatches.map((swatch) => (
                          <div
                            key={swatch.name}
                            className="border border-current/12"
                          >
                            <div
                              className="h-20 w-full"
                              style={{ background: swatch.hex }}
                            />
                            <div className="p-3">
                              <MonoLabel className="block text-[10px]">
                                {swatch.name}
                              </MonoLabel>
                              <MonoLabel className="block text-[10px] opacity-50">
                                {swatch.hex}
                              </MonoLabel>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="pt-6 text-sm opacity-70">
                  Background radius is zero throughout, and the chamfer — a 45°
                  cut on the left and right edges — is the only shape treatment
                  buttons get. More on that in{" "}
                  <Link
                    href="/blog/brand-refresh"
                    className="underline underline-offset-4"
                  >
                    the brand refresh note
                  </Link>
                  .
                </p>
              </section>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
