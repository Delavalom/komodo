import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Building2, Code, GitBranch, TrendingUp } from "lucide-react";

import { TestimonialCard } from "@/components/marketing/blocks";
import { Lissajous } from "@/components/marketing/figures";
import {
  ChamferLink,
  Container,
  CtaBand,
  DisplayHeading,
  MonoLabel,
  Section,
  SectionRule,
} from "@/components/marketing/ui";
import { getCustomer, getCustomers } from "@/lib/data/marketing/queries";

export function generateStaticParams() {
  return getCustomers().map((customer) => ({ slug: customer.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const customer = getCustomer(slug);
  return customer
    ? { title: `${customer.name} case study`, description: customer.title }
    : { title: "Case study not found" };
}

const FACT_ICONS = {
  code: Code,
  trend: TrendingUp,
  building: Building2,
  git: GitBranch,
};

/** docs/SPEC-MARKETING.md §M9.3. */
export default async function CaseStudyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const customer = getCustomer(slug);
  if (!customer) notFound();

  return (
    <>
      <Section grid={false} className="border-b border-current/10">
        <div className="pointer-events-none absolute inset-0 opacity-45" aria-hidden>
          <Lissajous seed={`case-${customer.slug}`} className="h-full w-full" />
        </div>
        <Container>
          <div className="relative grid items-end gap-12 py-24 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div>
              <MonoLabel className="block pb-6 opacity-55">
                {customer.name}
              </MonoLabel>
              <DisplayHeading as="h1" size="lg" className="max-w-3xl">
                {customer.title}
              </DisplayHeading>
              <div className="flex flex-wrap gap-12 pt-12">
                {customer.stats.map((stat) => (
                  <div key={stat.label}>
                    <div className="font-display text-5xl font-semibold tracking-[-0.03em]">
                      {stat.value}
                    </div>
                    <MonoLabel className="mt-1 block opacity-50">
                      {stat.label}
                    </MonoLabel>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative border border-current/20 p-1">
              <div className="bg-mkt-basalt p-8 text-center text-mkt-white">
                <p className="font-display text-lg">
                  See how Greptile can help your team.
                </p>
                <div className="flex justify-center pt-6">
                  <ChamferLink href="/contact" tone="green">
                    Request a demo
                  </ChamferLink>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      <div className="grid grid-cols-2 divide-x divide-y divide-current/10 border-b border-current/10 lg:grid-cols-4 lg:divide-y-0">
        {customer.facts.map((fact) => {
          const Icon = FACT_ICONS[fact.icon];
          return (
            <div
              key={fact.label}
              className="flex flex-col items-center gap-2 px-6 py-8 text-center"
            >
              <span className="flex h-8 w-8 items-center justify-center border border-current/20 opacity-60">
                <Icon size={14} aria-hidden />
              </span>
              <MonoLabel className="text-[12px]">{fact.value}</MonoLabel>
              <MonoLabel className="text-[10px] opacity-50">
                {fact.label}
              </MonoLabel>
            </div>
          );
        })}
      </div>

      <Section>
        <Container>
          <div className="grid gap-12 py-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <TestimonialCard testimonial={customer.quote} />
            <div>
              <DisplayHeading size="md" className="pb-8">
                Q&amp;A
              </DisplayHeading>
              <dl className="space-y-8">
                {customer.qa.map((entry) => (
                  <div
                    key={entry.question}
                    className="border-t border-current/10 pt-6"
                  >
                    <dt className="font-display text-base font-semibold">
                      {entry.question}
                    </dt>
                    <dd className="pt-3 text-[15px] leading-relaxed opacity-75">
                      {entry.answer}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="pt-10 text-xs leading-relaxed opacity-45">
                Fictional company and fictional numbers — see
                docs/SPEC-MARKETING.md §M12.3.
              </p>
            </div>
          </div>
        </Container>
      </Section>

      <Section grid={false} className="border-t border-current/10">
        <Container>
          <SectionRule>Learn more about Greptile</SectionRule>
          <div className="grid gap-6 py-14 lg:grid-cols-3">
            {[
              { href: "/agent", label: "Greptile Agent" },
              { href: "/trex", label: "Runtime validation" },
              { href: "/enterprise", label: "Enterprise" },
            ].map((link) => (
              <ChamferLink key={link.href} href={link.href} tone="basalt">
                {link.label}
              </ChamferLink>
            ))}
          </div>
        </Container>
      </Section>

      <CtaBand heading="Greptile consistently catches more bugs in large repos." />
    </>
  );
}
