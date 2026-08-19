import { Check, Minus } from "lucide-react";

import { FindingRow } from "./blocks";
import { Faq } from "./accordion";
import {
  ChamferLink,
  Container,
  CtaBand,
  DisplayHeading,
  Eyebrow,
  GridBackdrop,
  MonoLabel,
  Section,
  SectionRule,
} from "./ui";
import { getFaq, getLiveFindings } from "@/lib/data/marketing/queries";
import { cn } from "@/lib/utils";

/**
 * The comparison template — /greptile-vs-coderabbit, /greptile-vs-bugbot.
 * docs/SPEC-MARKETING.md §M10.5.
 *
 * The comparison rows describe how *we* build the product; the other column is
 * left deliberately generic rather than making claims about a named competitor
 * we have not measured here (§M12.3).
 */
export interface ComparisonRow {
  capability: string;
  detail: string;
  ours: boolean;
  theirs: boolean | "partial";
}

export function ComparisonPage({
  competitor,
  dek,
  rows,
  sections,
}: {
  competitor: string;
  dek: string;
  rows: ComparisonRow[];
  sections: { eyebrow: string; heading: string; body: string }[];
}) {
  return (
    <>
      <Section tone="dark" grid={false} className="border-b border-current/10">
        <GridBackdrop variant="cross" />
        <Container>
          <div className="max-w-3xl py-24">
            <Eyebrow className="pb-6">Comparison</Eyebrow>
            <DisplayHeading as="h1" size="lg">
              Greptile vs {competitor}
            </DisplayHeading>
            <p className="max-w-2xl pt-6 text-lg leading-relaxed opacity-75">
              {dek}
            </p>
            <div className="pt-10">
              <ChamferLink href="https://app.greptile.com/signup" tone="axolotl">
                Try it on your repo
              </ChamferLink>
            </div>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="py-16">
            <DisplayHeading size="md" className="pb-8">
              How the two approaches differ
            </DisplayHeading>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[42rem] border-collapse text-left">
                <thead>
                  <tr className="border-b border-current/20">
                    <th className="py-3 pr-6">
                      <MonoLabel className="opacity-55">Capability</MonoLabel>
                    </th>
                    <th className="w-28 py-3 pr-6">
                      <MonoLabel className="opacity-70">Greptile</MonoLabel>
                    </th>
                    <th className="w-28 py-3">
                      <MonoLabel className="opacity-55">Typical</MonoLabel>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.capability}
                      className="border-b border-current/10 align-top"
                    >
                      <td className="py-5 pr-6">
                        <span className="block text-sm font-semibold">
                          {row.capability}
                        </span>
                        <span className="block pt-1.5 text-sm leading-relaxed opacity-70">
                          {row.detail}
                        </span>
                      </td>
                      <td className="py-5 pr-6">
                        <Mark state={row.ours} />
                      </td>
                      <td className="py-5">
                        <Mark state={row.theirs} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="pt-6 text-xs leading-relaxed opacity-45">
              The right-hand column describes the common pattern in this class
              of tool rather than a measurement of a specific product — see
              docs/SPEC-MARKETING.md §M12.3.
            </p>
          </div>
        </Container>
      </Section>

      {sections.map((section, i) => (
        <Section
          key={section.heading}
          grid={i % 2 === 0}
          className={cn(i % 2 === 0 && "border-y border-current/10")}
        >
          <Container>
            <div className="max-w-3xl space-y-4 py-16">
              <Eyebrow>{section.eyebrow}</Eyebrow>
              <DisplayHeading size="md">{section.heading}</DisplayHeading>
              <p className="text-[15px] leading-relaxed opacity-80">
                {section.body}
              </p>
            </div>
          </Container>
        </Section>
      ))}

      <Section>
        <Container>
          <SectionRule>See where Greptile catches what others miss</SectionRule>
          <div className="grid gap-x-12 py-14 lg:grid-cols-2">
            {getLiveFindings().slice(0, 6).map((finding) => (
              <FindingRow key={finding.id} finding={finding} />
            ))}
          </div>
          <Faq items={getFaq("comparison")} />
        </Container>
      </Section>

      <CtaBand heading="Okay, I'm ready — how do I sign up?" />
    </>
  );
}

function Mark({ state }: { state: boolean | "partial" }) {
  if (state === "partial") {
    return (
      <span className="flex items-center gap-2 opacity-60">
        <Minus size={14} aria-hidden />
        <MonoLabel className="text-[10px]">partial</MonoLabel>
      </span>
    );
  }
  return state ? (
    <span className="flex items-center gap-2 text-mkt-green">
      <Check size={16} aria-hidden />
      <MonoLabel className="text-[10px]">yes</MonoLabel>
    </span>
  ) : (
    <span className="flex items-center gap-2 opacity-40">
      <Minus size={14} aria-hidden />
      <MonoLabel className="text-[10px]">no</MonoLabel>
    </span>
  );
}
