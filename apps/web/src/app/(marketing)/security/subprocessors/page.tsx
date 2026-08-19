import type { Metadata } from "next";

import {
  Container,
  DisplayHeading,
  GridBackdrop,
  MonoLabel,
  Section,
} from "@/components/marketing/ui";
import { getSubprocessors } from "@/lib/data/marketing/queries";

export const metadata: Metadata = {
  title: "Subprocessors",
  description: "Third parties that process customer data on our behalf.",
};

/** docs/SPEC-MARKETING.md §M10.6. */
export default function SubprocessorsPage() {
  const rows = getSubprocessors();

  return (
    <>
      <Section grid={false} className="border-b border-current/10">
        <GridBackdrop variant="both" />
        <Container>
          <div className="max-w-3xl py-20">
            <DisplayHeading as="h1" size="lg">
              Subprocessors
            </DisplayHeading>
            <p className="pt-6 text-lg leading-relaxed opacity-75">
              Third parties that process customer data on our behalf, and what
              each of them is for.
            </p>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="max-w-4xl py-16">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-current/20">
                  {["Subprocessor", "Purpose", "Location"].map((head) => (
                    <th key={head} className="py-3 pr-6">
                      <MonoLabel className="opacity-55">{head}</MonoLabel>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.name} className="border-b border-current/10">
                    <td className="py-4 pr-6 text-sm font-medium">{row.name}</td>
                    <td className="py-4 pr-6 text-sm opacity-75">
                      {row.purpose}
                    </td>
                    <td className="py-4 text-sm opacity-75">{row.location}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="pt-8 text-xs leading-relaxed opacity-45">
              Placeholder list written for this clone — see
              docs/SPEC-MARKETING.md §M12.3.
            </p>
          </div>
        </Container>
      </Section>
    </>
  );
}
