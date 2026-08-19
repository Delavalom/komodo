import Link from "next/link";
import { GitFork, Star, Boxes } from "lucide-react";

import type {
  Block,
  Finding,
  RepoGroup,
  Testimonial,
} from "@/lib/marketing-types";
import { cn } from "@/lib/utils";

import { Lissajous } from "./figures";
import {
  ChamferLink,
  Container,
  DisplayHeading,
  MonoLabel,
  Section,
} from "./ui";

/* ══ Long-form body ═════════════════════════════════════════ §M9 ══ */

/** Renders the `Block[]` bodies from the seam. Placeholder editorial (§M12.3). */
export function Prose({
  blocks,
  className,
}: {
  blocks: Block[];
  className?: string;
}) {
  return (
    <div className={cn("space-y-6", className)}>
      {blocks.map((block, i) => {
        switch (block.kind) {
          case "h2":
            return (
              <DisplayHeading key={i} as="h2" size="sm" className="pt-6">
                {block.text}
              </DisplayHeading>
            );
          case "h3":
            return (
              <h3
                key={i}
                className="pt-4 font-display text-lg font-semibold tracking-[-0.01em]"
              >
                {block.text}
              </h3>
            );
          case "ul":
            return (
              <ul key={i} className="space-y-2 pl-5">
                {block.items.map((item, j) => (
                  <li
                    key={j}
                    className="list-disc text-[15px] leading-relaxed opacity-80 marker:text-mkt-green"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="space-y-2 pl-5">
                {block.items.map((item, j) => (
                  <li
                    key={j}
                    className="list-decimal text-[15px] leading-relaxed opacity-80"
                  >
                    {item}
                  </li>
                ))}
              </ol>
            );
          case "quote":
            return (
              <blockquote
                key={i}
                className="border-l-2 border-mkt-green pl-5 font-display text-xl leading-snug"
              >
                {block.text}
              </blockquote>
            );
          case "code":
            return (
              <pre
                key={i}
                className="overflow-x-auto border border-current/12 bg-mkt-basalt p-4 font-label text-[12px] leading-relaxed text-mkt-lichen"
              >
                {block.lines.join("\n")}
              </pre>
            );
          case "figure":
            return null;
          default:
            return (
              <p key={i} className="text-[15px] leading-relaxed opacity-80">
                {block.text}
              </p>
            );
        }
      })}
    </div>
  );
}

/* ══ Findings ═══════════════════════════════════ §M4.5, §M6, §M7 ══ */

export function SeverityChip({
  severity,
  className,
}: {
  severity: string;
  className?: string;
}) {
  return (
    <MonoLabel
      className={cn(
        "inline-block border border-current/20 px-2 py-0.5 opacity-70",
        className,
      )}
    >
      {severity}
    </MonoLabel>
  );
}

/** The tall card used on the home page and on /examples. §M4.5 */
export function FindingCard({ finding }: { finding: Finding }) {
  return (
    <article className="flex flex-col border border-current/12 bg-current/[0.03]">
      <div className="flex items-center gap-2 border-b border-current/12 px-4 py-3">
        <span className="h-3 w-2.5 shrink-0 border border-current/40" aria-hidden />
        <span className="truncate font-label text-[11px] opacity-70">
          {finding.path}
        </span>
      </div>

      <div className="space-y-1.5 px-4 py-4" aria-hidden>
        {finding.diff.map((line, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="w-4 font-label text-[10px] opacity-35">
              {line.no}
            </span>
            <span className="w-2 font-label text-[10px] opacity-45">
              {line.sign}
            </span>
            <span
              className="h-[9px]"
              style={{
                width: `${Math.round(line.width * 100)}%`,
                background:
                  line.sign === "+"
                    ? "rgba(40,233,159,0.45)"
                    : "rgba(255,172,254,0.5)",
              }}
            />
          </div>
        ))}
      </div>

      <div className="flex-1 border-t border-current/12 px-4 py-4">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 bg-mkt-green" aria-hidden />
          <MonoLabel className="opacity-60">greptile</MonoLabel>
          <SeverityChip severity={finding.severity} className="ml-auto" />
        </div>
        <p className="pt-3 font-display text-base font-semibold leading-snug">
          {finding.title}
        </p>
      </div>

      <a
        href={finding.url}
        className="border-t border-current/12 px-4 py-3 text-center font-label text-[11px] uppercase tracking-[0.18em] opacity-65 transition-opacity hover:opacity-100"
      >
        See PR <span aria-hidden>→</span>
      </a>
    </article>
  );
}

/** The compact row used by the live feed and the enterprise stat band. §M6 */
export function FindingRow({ finding }: { finding: Finding }) {
  return (
    <a
      href={finding.url}
      className="flex flex-col gap-2 border-b border-current/10 px-1 py-4 transition-colors hover:bg-current/[0.04] sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <SeverityChip severity={finding.severity} className="self-start" />
        <span className="truncate font-display text-[15px] font-medium">
          {finding.title}
        </span>
      </div>
      <MonoLabel className="shrink-0 opacity-55">
        {finding.repo} · #{finding.prNumber}
      </MonoLabel>
    </a>
  );
}

export function RepoHeader({ group }: { group: RepoGroup }) {
  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
      <DisplayHeading as="h3" size="sm" className="text-2xl">
        {group.name}
      </DisplayHeading>
      <div className="flex flex-wrap items-center gap-6">
        <RepoStat icon={<Star size={13} />} value={group.stars} label="Stars" />
        <RepoStat
          icon={<GitFork size={13} />}
          value={group.forks}
          label="Forks"
        />
        {group.repositories ? (
          <RepoStat
            icon={<Boxes size={13} />}
            value={String(group.repositories)}
            label="Repositories"
          />
        ) : (
          <RepoStat
            icon={<Boxes size={13} />}
            value={group.repo}
            label="Repository"
            mono
          />
        )}
      </div>
    </div>
  );
}

function RepoStat({
  icon,
  value,
  label,
  mono,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center border border-current/20 opacity-60">
        {icon}
      </span>
      <span>
        <span
          className={cn(
            "block text-sm font-semibold",
            mono && "font-label text-[12px] font-normal",
          )}
        >
          {value}
        </span>
        <MonoLabel className="block text-[10px] opacity-50">{label}</MonoLabel>
      </span>
    </div>
  );
}

/* ══ Testimonials ═══════════════════════════════════════════ §M4.10 ══ */

export function TestimonialCard({
  testimonial,
  className,
}: {
  testimonial: Testimonial;
  className?: string;
}) {
  return (
    <figure
      className={cn(
        "flex flex-col gap-4 border border-current/10 bg-current/[0.02] p-6",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center bg-mkt-basalt font-label text-[11px] text-mkt-white"
        >
          {testimonial.monogram}
        </span>
        <span className="min-w-0">
          <MonoLabel className="block truncate">{testimonial.name}</MonoLabel>
          <MonoLabel className="block truncate text-[10px] opacity-55">
            {testimonial.role} · {testimonial.company}
          </MonoLabel>
        </span>
        <span
          aria-hidden
          className="ml-auto h-4 w-4 shrink-0 bg-mkt-orchid opacity-70"
        />
      </div>
      <blockquote className="text-[15px] leading-relaxed opacity-80">
        {testimonial.quote}
      </blockquote>
    </figure>
  );
}

/* ══ Logo wall ══════════════════════════════════════════════ §M4.2 ══
   Invented companies set in the site's own type — this repo ships no
   third-party marks (§M12.3). */

export function LogoWall({ names }: { names: string[] }) {
  return (
    <div className="grid grid-cols-2 divide-x divide-y divide-current/10 border-y border-current/10 sm:grid-cols-4 lg:grid-cols-8 lg:divide-y-0">
      {names.map((name) => (
        <div
          key={name}
          className="flex items-center justify-center px-4 py-6 opacity-40"
        >
          <span className="font-display text-lg font-semibold tracking-[-0.02em]">
            {name}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ══ Post rows ═════════════════════════════════════════ §M9.1, §M9.2 ══ */

export function PostRow({
  href,
  index,
  category,
  title,
  dek,
  meta,
}: {
  href: string;
  index?: number;
  category: string;
  title: string;
  dek?: string;
  meta?: string;
}) {
  return (
    <Link
      href={href}
      className="group flex gap-6 border-b border-current/10 py-8 transition-colors hover:bg-current/[0.03]"
    >
      {index !== undefined ? (
        <span
          aria-hidden
          className="hidden font-display text-5xl font-bold opacity-15 sm:block"
        >
          {String(index).padStart(2, "0")}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <MonoLabel className="opacity-55">{category}</MonoLabel>
        <DisplayHeading as="h3" size="sm" className="pt-2">
          {title}
        </DisplayHeading>
        {dek ? (
          <p className="max-w-3xl pt-2 text-sm leading-relaxed opacity-70">
            {dek}
          </p>
        ) : null}
        {meta ? (
          <MonoLabel className="mt-3 block opacity-45">{meta}</MonoLabel>
        ) : null}
      </div>
      <span
        aria-hidden
        className="self-start pt-1 opacity-40 transition-opacity group-hover:opacity-90"
      >
        ↗
      </span>
    </Link>
  );
}

/* ══ Pull quote ═════════════════════════════════════════════ §M4.3 ══ */

export function PullQuote({
  quote,
  name,
  role,
  monogram,
  href = "/customers/northbeam",
  linkLabel = "View Northbeam case study",
}: {
  quote: string;
  name: string;
  role: string;
  monogram: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <Section grid={false} className="border-y border-current/10">
      <div className="pointer-events-none absolute inset-0 opacity-45" aria-hidden>
        <Lissajous seed="quote" className="h-full w-full" />
      </div>
      <Container>
        <div className="mx-auto max-w-4xl py-24 text-center">
          <span
            aria-hidden
            className="mx-auto mb-8 block h-4 w-6 border-2 border-current opacity-60"
          />
          <DisplayHeading size="lg" className="text-balance">
            &ldquo;{quote}&rdquo;
          </DisplayHeading>

          <div className="flex items-center justify-center gap-4 pt-10">
            <span
              aria-hidden
              className="flex h-12 w-12 items-center justify-center bg-mkt-basalt font-label text-sm text-mkt-white"
            >
              {monogram}
            </span>
            <span className="text-left">
              <span className="block font-display text-base font-semibold italic">
                {role}
              </span>
              <MonoLabel className="block opacity-60">{name}</MonoLabel>
            </span>
          </div>

          <div className="flex justify-center pt-8">
            <ChamferLink href={href} tone="basalt">
              {linkLabel}
            </ChamferLink>
          </div>
        </div>
      </Container>
    </Section>
  );
}
