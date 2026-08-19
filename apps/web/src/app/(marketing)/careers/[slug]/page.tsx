import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Prose } from "@/components/marketing/blocks";
import {
  ChamferLink,
  Container,
  CtaBand,
  DisplayHeading,
  GridBackdrop,
  MonoLabel,
  Section,
} from "@/components/marketing/ui";
import { getJob, getJobs } from "@/lib/data/marketing/queries";

export function generateStaticParams() {
  return getJobs().map((job) => ({ slug: job.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const job = getJob(slug);
  return job
    ? {
        title: `${job.title} — Careers at Greptile`,
        description: `${job.title}, ${job.location}. ${job.type}.`,
      }
    : { title: "Role not found" };
}

/** docs/SPEC-MARKETING.md §M9.4. */
export default async function JobPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const job = getJob(slug);
  if (!job) notFound();

  return (
    <>
      <Section grid={false} className="border-b border-current/10">
        <GridBackdrop variant="both" />
        <Container>
          <div className="max-w-3xl py-20">
            <Link
              href="/careers"
              className="font-label text-[11px] uppercase tracking-[0.18em] opacity-60 underline underline-offset-4"
            >
              <span aria-hidden>←</span> Careers
            </Link>
            <DisplayHeading as="h1" size="lg" className="pt-8">
              {job.title}
            </DisplayHeading>
            <MonoLabel className="mt-6 block opacity-55">
              {job.team} · {job.location} · {job.type}
            </MonoLabel>
            <div className="pt-8">
              <ChamferLink href="/contact" tone="green">
                Apply for this role
              </ChamferLink>
            </div>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <article className="max-w-3xl space-y-12 py-16">
            {job.sections.map((section) => (
              <section key={section.heading}>
                <DisplayHeading as="h2" size="sm">
                  {section.heading}
                </DisplayHeading>
                <div className="pt-4">
                  <Prose blocks={section.body} />
                </div>
              </section>
            ))}
            <p className="text-xs leading-relaxed opacity-45">
              Placeholder listing written for this clone — see
              docs/SPEC-MARKETING.md §M12.3.
            </p>
          </article>
        </Container>
      </Section>

      <CtaBand
        heading="Send us something you built and the hardest decision in it."
        primary={{ label: "Get in touch", href: "/contact" }}
        secondary={{ label: "All roles", href: "/careers" }}
      />
    </>
  );
}
