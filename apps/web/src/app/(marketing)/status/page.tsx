import type { Metadata } from "next";

import {
  Container,
  GridBackdrop,
  MonoLabel,
  PosterHeading,
  Section,
} from "@/components/marketing/ui";
import { getStatusComponents } from "@/lib/data/marketing/queries";

export const metadata: Metadata = {
  title: "System Status",
  description: "Current status of every Greptile component.",
};

/** docs/SPEC-MARKETING.md §M10.8. */
export default function StatusPage() {
  const components = getStatusComponents();
  const allUp = components.every((c) => c.state === "operational");

  return (
    <>
      <Section grid={false} className="border-b border-current/10">
        <GridBackdrop variant="both" />
        <Container>
          <div className="py-24 text-center">
            <PosterHeading>System Status</PosterHeading>
            <p className="flex items-center justify-center gap-3 pt-8">
              <span className="h-2.5 w-2.5 rounded-full bg-mkt-green" />
              <span className="font-display text-lg">
                {allUp
                  ? "All systems operational"
                  : "Some systems are degraded"}
              </span>
            </p>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="mx-auto max-w-4xl py-16">
            {components.map((component) => (
              <div
                key={component.name}
                className="border-b border-current/10 py-6"
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="font-display text-base font-semibold">
                    {component.name}
                  </span>
                  <MonoLabel className="flex items-center gap-2 opacity-65">
                    <span className="h-2 w-2 rounded-full bg-mkt-green" />
                    {component.state}
                  </MonoLabel>
                </div>
                <div className="mt-4 flex gap-[2px]" aria-hidden>
                  {component.uptime.map((day, i) => (
                    <span
                      key={i}
                      className="h-7 flex-1"
                      style={{
                        background:
                          day === 1
                            ? "rgba(40,233,159,0.75)"
                            : "rgba(255,109,109,0.75)",
                      }}
                    />
                  ))}
                </div>
                <MonoLabel className="mt-2 block opacity-40">
                  90 days ago — today
                </MonoLabel>
              </div>
            ))}
            <p className="pt-8 text-xs leading-relaxed opacity-45">
              Synthetic uptime series — see docs/SPEC-MARKETING.md §M12.3.
            </p>
          </div>
        </Container>
      </Section>
    </>
  );
}
