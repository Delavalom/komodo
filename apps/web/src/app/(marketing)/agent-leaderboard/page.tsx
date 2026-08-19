import type { Metadata } from "next";

import { ChartPanel } from "@/components/marketing/charts";
import {
  Container,
  CtaBand,
  GridBackdrop,
  PosterHeading,
  Section,
} from "@/components/marketing/ui";
import { getLeaderboard } from "@/lib/data/marketing/queries";

export const metadata: Metadata = {
  title: "Agent Leaderboard",
  description:
    "How agent-authored pull requests behave once they reach review and production.",
};

/** docs/SPEC-MARKETING.md §M10.3. */
export default function AgentLeaderboardPage() {
  const panels = getLeaderboard();

  return (
    <>
      <Section tone="dark" grid={false} className="border-b border-current/10">
        <GridBackdrop variant="cross" />
        <Container>
          <div className="py-24 text-center">
            <PosterHeading className="text-mkt-pollen">
              Agent leaderboard
            </PosterHeading>
            <p className="mx-auto max-w-2xl pt-8 text-lg opacity-75">
              What happens to agent-authored pull requests after they are
              opened — how often they are reverted, how much they churn, and
              how many review rounds they take.
            </p>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="grid gap-6 py-16 lg:grid-cols-3">
            {panels.map((panel) => (
              <ChartPanel key={panel.title} panel={panel} />
            ))}
          </div>
          <p className="pb-16 text-xs leading-relaxed opacity-45">
            Every series here is seeded, not measured — see
            docs/SPEC-MARKETING.md §M12.3.
          </p>
        </Container>
      </Section>

      <CtaBand heading="Validation is the part of the loop that did not get cheaper." />
    </>
  );
}
