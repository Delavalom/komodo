import type { Metadata } from "next";

import {
  Container,
  CtaBand,
  DisplayHeading,
  GridBackdrop,
  MonoLabel,
  PosterHeading,
  Section,
} from "@/components/marketing/ui";
import { getChangelog } from "@/lib/data/marketing/queries";
import { shortDate } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Changelog",
  description: "What shipped, newest first.",
};

/** docs/SPEC-MARKETING.md §M9.5. */
export default function ChangelogPage() {
  const entries = getChangelog();

  return (
    <>
      <Section grid={false} className="border-b border-current/10">
        <GridBackdrop variant="both" />
        <Container>
          <div className="py-24 text-center">
            <PosterHeading>Changelog</PosterHeading>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="max-w-4xl py-16">
            {entries.map((entry) => (
              <article
                key={entry.id}
                className="grid gap-6 border-b border-current/10 py-10 sm:grid-cols-[minmax(0,0.25fr)_minmax(0,1fr)]"
              >
                <div>
                  <MonoLabel className="block opacity-70">
                    {entry.version}
                  </MonoLabel>
                  <MonoLabel className="block pt-1 opacity-45">
                    {shortDate(entry.publishedAt)}
                  </MonoLabel>
                </div>
                <div>
                  <DisplayHeading as="h2" size="sm">
                    {entry.title}
                  </DisplayHeading>
                  <p className="pt-3 text-[15px] leading-relaxed opacity-75">
                    {entry.body}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-4">
                    {entry.tags.map((tag) => (
                      <MonoLabel
                        key={tag}
                        className="bg-current/[0.07] px-2 py-0.5 opacity-60"
                      >
                        {tag}
                      </MonoLabel>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </Container>
      </Section>

      <CtaBand heading="Every release lands on the free tier the same day." />
    </>
  );
}
