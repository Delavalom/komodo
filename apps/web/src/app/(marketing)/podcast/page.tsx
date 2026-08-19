import type { Metadata } from "next";
import { Play } from "lucide-react";

import {
  Container,
  CtaBand,
  DisplayHeading,
  GridBackdrop,
  MonoLabel,
  PosterHeading,
  Section,
} from "@/components/marketing/ui";
import { getEpisodes } from "@/lib/data/marketing/queries";
import { shortDate } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Who's a Good Dev? — The Greptile podcast",
  description: "Conversations about how review actually works inside busy teams.",
};

/** docs/SPEC-MARKETING.md §M10.10. */
export default function PodcastPage() {
  const episodes = getEpisodes();

  return (
    <>
      <Section tone="dark" grid={false} className="border-b border-current/10">
        <GridBackdrop variant="cross" />
        <Container>
          <div className="py-24 text-center">
            <PosterHeading className="text-mkt-pollen">
              Who&apos;s a good dev?
            </PosterHeading>
            <p className="mx-auto max-w-2xl pt-8 text-lg opacity-75">
              Conversations about how review actually works inside teams that
              ship a lot.
            </p>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="mx-auto max-w-4xl py-16">
            {episodes.map((episode) => (
              <article
                key={episode.number}
                className="flex gap-6 border-b border-current/10 py-8"
              >
                <span
                  aria-hidden
                  className="flex h-12 w-12 shrink-0 items-center justify-center border border-current/20 opacity-70"
                >
                  <Play size={16} />
                </span>
                <div className="min-w-0">
                  <MonoLabel className="opacity-50">
                    Episode {String(episode.number).padStart(2, "0")}
                  </MonoLabel>
                  <DisplayHeading as="h2" size="sm" className="pt-2">
                    {episode.title}
                  </DisplayHeading>
                  <MonoLabel className="mt-2 block opacity-55">
                    {episode.guest} · {episode.guestRole}
                  </MonoLabel>
                  <p className="pt-3 text-sm leading-relaxed opacity-70">
                    {episode.summary}
                  </p>
                  <MonoLabel className="mt-3 block opacity-40">
                    {shortDate(episode.publishedAt)} · {episode.minutes} min
                  </MonoLabel>
                </div>
              </article>
            ))}
            <p className="pt-8 text-xs leading-relaxed opacity-45">
              Fictional guests — see docs/SPEC-MARKETING.md §M12.3.
            </p>
          </div>
        </Container>
      </Section>

      <CtaBand heading="Subscribe wherever you already listen to things." />
    </>
  );
}
