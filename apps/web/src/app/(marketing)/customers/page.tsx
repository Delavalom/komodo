import type { Metadata } from "next";
import Link from "next/link";

import { PullQuote, TestimonialCard } from "@/components/marketing/blocks";
import {
  Container,
  CtaBand,
  DisplayHeading,
  GridBackdrop,
  MonoLabel,
  PosterHeading,
  Section,
  SectionRule,
  StatBand,
} from "@/components/marketing/ui";
import {
  getCustomers,
  getHeroQuote,
  getStatBand,
  getTestimonials,
} from "@/lib/data/marketing/queries";

export const metadata: Metadata = {
  title: "Customers — Success stories and case studies",
  description:
    "How engineering teams use Greptile to keep large codebases reviewable.",
};

/** docs/SPEC-MARKETING.md §M9.3. */
export default function CustomersPage() {
  const quote = getHeroQuote();
  const customers = getCustomers();
  const testimonials = getTestimonials();

  return (
    <>
      <Section grid={false} className="border-b border-current/10">
        <GridBackdrop variant="both" />
        <Container>
          <div className="py-24 text-center">
            <PosterHeading>Greptile empowers modern software teams</PosterHeading>
          </div>
        </Container>
      </Section>

      <PullQuote
        quote={quote.quote}
        name={quote.name}
        role={`${quote.role} @ ${quote.company}`}
        monogram={quote.monogram}
      />

      <Section>
        <Container>
          <SectionRule>Case studies</SectionRule>
          <div className="grid gap-6 py-14 lg:grid-cols-2">
            {customers.map((customer) => (
              <Link
                key={customer.slug}
                href={`/customers/${customer.slug}`}
                className="group flex flex-col gap-4 border border-current/12 p-8 transition-colors hover:bg-current/[0.04]"
              >
                <MonoLabel className="opacity-55">
                  {customer.name} · {customer.industry}
                </MonoLabel>
                <DisplayHeading as="h2" size="sm">
                  {customer.title}
                </DisplayHeading>
                <p className="flex-1 text-sm leading-relaxed opacity-70">
                  {customer.blurb}
                </p>
                <div className="flex gap-8 pt-2">
                  {customer.stats.map((stat) => (
                    <span key={stat.label}>
                      <span className="block font-display text-2xl font-semibold">
                        {stat.value}
                      </span>
                      <MonoLabel className="block opacity-50">
                        {stat.label}
                      </MonoLabel>
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </Container>
      </Section>

      <Section grid={false} className="border-y border-current/10">
        <Container>
          <div className="py-16">
            <DisplayHeading size="md" className="pb-10">
              What our customers are saying
            </DisplayHeading>
            <div className="grid gap-6 lg:grid-cols-3">
              {testimonials.map((testimonial) => (
                <TestimonialCard
                  key={testimonial.id}
                  testimonial={testimonial}
                />
              ))}
            </div>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="py-10">
            <SectionRule>See what Greptile can catch.</SectionRule>
            <StatBand stats={getStatBand()} />
          </div>
        </Container>
      </Section>

      <CtaBand heading="Sign up for Greptile." />
    </>
  );
}
