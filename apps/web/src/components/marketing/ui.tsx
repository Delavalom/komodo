import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

/* ══ Logo ═══════════════════════════════════════════════════ §M2.2 ══ */

export function MarkGlyph({
  className,
  tone = "basalt",
}: {
  className?: string;
  tone?: "basalt" | "green" | "white";
}) {
  const fill =
    tone === "green" ? "#28e99f" : tone === "white" ? "#fefefe" : "#3d3b4f";
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("h-8 w-8", className)}>
      <path fill={fill} d="M16 2 30 10v12L16 30 2 22V10L16 2Z" opacity="0.22" />
      <path
        fill={fill}
        d="M16 4.6 27.4 11v10L16 27.4 4.6 21V11L16 4.6Zm0 3.1L7.4 12.6v7.2l4.9 2.8v-6l3.7-2.1 3.7 2.1v6l4.9-2.8v-7.2L16 7.7Z"
      />
    </svg>
  );
}

export function Wordmark({
  className,
  tone = "green",
}: {
  className?: string;
  tone?: "basalt" | "green" | "white";
}) {
  const color =
    tone === "green" ? "#28e99f" : tone === "white" ? "#fefefe" : "#3d3b4f";
  return (
    <span
      className={cn("font-display text-6xl font-bold lowercase", className)}
      style={{ color, letterSpacing: "-0.03em" }}
    >
      greptile
    </span>
  );
}

/* ══ Chamfered controls ═════════════════════════════════════ §M1.4 ══ */

type ChamferTone = "green" | "basalt" | "axolotl" | "pollen" | "outline";

const CHAMFER_TONES: Record<ChamferTone, string> = {
  green: "bg-mkt-green text-mkt-basalt hover:bg-mkt-lichen",
  basalt: "bg-mkt-basalt text-mkt-white hover:bg-mkt-black",
  axolotl: "bg-mkt-axolotl text-mkt-basalt hover:bg-mkt-orchid",
  pollen: "bg-mkt-pollen text-mkt-basalt hover:bg-mkt-gecko",
  outline:
    "bg-transparent text-current ring-1 ring-inset ring-current/45 hover:bg-current/10",
};

const CHAMFER_BASE =
  "chamfer inline-flex items-center justify-center gap-2 whitespace-nowrap px-[26px] py-[10px] font-display text-sm leading-5 transition-colors";

export function ChamferLink({
  href,
  tone = "green",
  className,
  children,
  ...rest
}: {
  href: string;
  tone?: ChamferTone;
  className?: string;
  children: ReactNode;
} & Omit<ComponentProps<typeof Link>, "href" | "className" | "children">) {
  const isExternal = href.startsWith("http") || href.startsWith("#");
  const classes = cn(CHAMFER_BASE, CHAMFER_TONES[tone], className);

  if (isExternal) {
    return (
      <a href={href} className={classes}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={classes} {...rest}>
      {children}
    </Link>
  );
}

export function ChamferButton({
  tone = "green",
  className,
  children,
  ...rest
}: {
  tone?: ChamferTone;
} & ComponentProps<"button">) {
  return (
    <button
      className={cn(CHAMFER_BASE, CHAMFER_TONES[tone], className)}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * The interlocked pair from the hero: the second button's chamfer bites into
 * the first, so the two cuts share an edge. §M1.4
 */
export function ChamferPair({ children }: { children: ReactNode }) {
  return <div className="flex items-stretch -space-x-[10px]">{children}</div>;
}

/* ══ Typographic furniture ══════════════════════════ §M1.1, §M1.5 ══ */

/** `[ AGENT ]` — Space Mono, uppercase, wide. */
export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "font-label text-xs uppercase tracking-[0.22em] opacity-70",
        className,
      )}
    >
      [ {children} ]
    </p>
  );
}

/** A bare mono label with no brackets — used on cards and stat rows. */
export function MonoLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-label text-[11px] uppercase tracking-[0.18em]",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function DisplayHeading({
  as: As = "h2",
  size = "md",
  className,
  children,
}: {
  as?: "h1" | "h2" | "h3";
  size?: "xl" | "lg" | "md" | "sm";
  className?: string;
  children: ReactNode;
}) {
  const sizes = {
    xl: "text-[clamp(2.75rem,7vw,6rem)] leading-[0.98] tracking-[-0.025em] font-extrabold",
    lg: "text-[clamp(2.25rem,4.6vw,3.5rem)] leading-[1.02] tracking-[-0.03em] font-semibold",
    md: "text-[clamp(1.75rem,3.2vw,3rem)] leading-[1.04] tracking-[-0.03em] font-semibold",
    sm: "text-[clamp(1.25rem,2vw,1.5rem)] leading-[1.15] tracking-[-0.02em] font-semibold",
  };
  return (
    <As className={cn("font-display", sizes[size], className)}>{children}</As>
  );
}

/** The stretched uppercase wordmark used on the poster pages. §M1.1 */
export function PosterHeading({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h1
      className={cn(
        "poster-type text-[clamp(2.5rem,8.5vw,7rem)] leading-[0.95]",
        className,
      )}
    >
      {children}
    </h1>
  );
}

/* ══ Ornament ═══════════════════════════════════════════════ §M1.5 ══ */

/** The dot lattice, with corner dots pinned to the section box. */
export function GridBackdrop({
  variant = "dots",
  className,
}: {
  variant?: "dots" | "cross" | "both";
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0", className)}
    >
      {(variant === "dots" || variant === "both") && (
        <div className="dotgrid absolute inset-0" />
      )}
      {(variant === "cross" || variant === "both") && (
        <div className="crossgrid absolute inset-0" />
      )}
      <CornerDots />
    </div>
  );
}

export function CornerDots({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("absolute inset-0", className)}>
      {[
        "left-0 top-0",
        "right-0 top-0",
        "left-0 bottom-0",
        "right-0 bottom-0",
      ].map((pos) => (
        <span
          key={pos}
          className={cn(
            "absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current opacity-25",
            pos,
            pos.includes("right") && "translate-x-1/2",
            pos.includes("bottom") && "translate-y-1/2",
          )}
        />
      ))}
    </div>
  );
}

/**
 * The ruler rail: a hairline of tick marks with a centered mono label sitting
 * on top of it. This is the site's section divider. §M1.5
 */
export function SectionRule({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative w-full py-6", className)}>
      <div className="ruler-rail absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 opacity-80" />
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-current opacity-10" />
      {children ? (
        <div className="relative flex justify-center">
          <MonoLabel className="bg-[var(--mkt-label-bg,transparent)] px-4 opacity-75 backdrop-blur-[2px]">
            {children}
          </MonoLabel>
        </div>
      ) : null}
    </div>
  );
}

/**
 * A dashed frame whose corner gutters are filled with 45° hatch — the wrapper
 * around every "step" card and the pricing hero. §M1.5
 */
export function HatchFrame({
  children,
  className,
  inset = "p-3",
}: {
  children: ReactNode;
  className?: string;
  inset?: string;
}) {
  return (
    <div
      className={cn(
        "relative border border-dashed border-current/25",
        inset,
        className,
      )}
    >
      <span
        aria-hidden
        className="hatch pointer-events-none absolute -left-px -top-px h-8 w-8 opacity-70"
      />
      <span
        aria-hidden
        className="hatch pointer-events-none absolute -bottom-px -right-px h-8 w-8 opacity-70"
      />
      {children}
    </div>
  );
}

/** Infinite mono scroller. Two identical tracks make the loop seamless. */
export function Marquee({
  text,
  reverse = false,
  duration = 42,
  className,
}: {
  text: string;
  reverse?: boolean;
  duration?: number;
  className?: string;
}) {
  const run = Array.from({ length: 10 }, (_, i) => (
    <span key={i} className="px-6">
      {text}
    </span>
  ));
  return (
    <div
      aria-hidden
      className={cn(
        "flex w-full overflow-hidden border-y border-current/10 py-2",
        className,
      )}
    >
      <div
        className={cn(
          "flex w-max shrink-0 font-label text-[11px] uppercase tracking-[0.3em] opacity-55",
          reverse ? "marquee-track-reverse" : "marquee-track",
        )}
        style={{ ["--marquee-duration" as string]: `${duration}s` }}
      >
        <div className="flex">{run}</div>
        <div className="flex">{run}</div>
      </div>
    </div>
  );
}

/* ══ Section scaffolding ════════════════════════════════════════════ */

export function Section({
  tone = "light",
  className,
  children,
  grid = true,
  id,
}: {
  tone?: "light" | "dark";
  className?: string;
  children: ReactNode;
  grid?: boolean;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "relative isolate w-full overflow-hidden",
        tone === "dark" ? "mkt-dark" : "",
        className,
      )}
    >
      {grid ? <GridBackdrop /> : null}
      <div className="relative z-10">{children}</div>
    </section>
  );
}

export function Container({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-[1440px] px-6 lg:px-10", className)}>
      {children}
    </div>
  );
}

/** Heading + lede + optional floated action — the standard section opener. */
export function SectionIntro({
  eyebrow,
  heading,
  lede,
  action,
  align = "left",
  className,
}: {
  eyebrow?: string;
  heading: string;
  lede?: string;
  action?: ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-6 py-16 lg:flex-row lg:items-end lg:justify-between",
        align === "center" && "lg:flex-col lg:items-center lg:text-center",
        className,
      )}
    >
      <div
        className={cn(
          "max-w-3xl space-y-4",
          align === "center" && "mx-auto text-center",
        )}
      >
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <DisplayHeading size="lg">{heading}</DisplayHeading>
        {lede ? (
          <p className="max-w-2xl text-base leading-relaxed opacity-75 lg:text-lg">
            {lede}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Numbered card — `01 Self-Hosted Deployment`. §M4.9 */
export function NumberedCard({
  index,
  title,
  body,
  className,
  children,
}: {
  index: number;
  title: string;
  body?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-h-full flex-col gap-3 border-l border-current/12 px-6 py-8",
        className,
      )}
    >
      <MonoLabel className="opacity-50">
        {String(index).padStart(2, "0")}
      </MonoLabel>
      {children}
      <DisplayHeading as="h3" size="sm">
        {title}
      </DisplayHeading>
      {body ? (
        <p className="text-sm leading-relaxed opacity-70">{body}</p>
      ) : null}
    </div>
  );
}

export function StatBand({
  stats,
  className,
}: {
  stats: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 divide-current/12 lg:grid-cols-4 lg:divide-x",
        className,
      )}
    >
      {stats.map((s) => (
        <div key={s.label} className="px-6 py-10">
          <div className="font-display text-5xl font-semibold tracking-[-0.03em]">
            {s.value}
          </div>
          <MonoLabel className="mt-2 block opacity-55">{s.label}</MonoLabel>
        </div>
      ))}
    </div>
  );
}

/** The closing CTA band that ends nearly every page. §M4.12 */
export function CtaBand({
  heading,
  primary = { label: "Start now", href: "https://app.greptile.com/signup" },
  secondary = { label: "View Pricing", href: "/pricing" },
  figure,
}: {
  heading: string;
  primary?: { label: string; href: string };
  secondary?: { label: string; href: string };
  figure?: ReactNode;
}) {
  return (
    <Section tone="dark" grid={false}>
      <GridBackdrop variant="cross" />
      <Container>
        <div className="grid items-center gap-12 py-24 lg:grid-cols-2">
          <DisplayHeading size="lg" className="text-mkt-pollen">
            {heading}
          </DisplayHeading>
          <div className="lg:justify-self-end">{figure}</div>
        </div>
        <div className="pb-24">
          <ChamferPair>
            <ChamferLink href={secondary.href} tone="outline">
              {secondary.label}
            </ChamferLink>
            <ChamferLink href={primary.href} tone="pollen">
              {primary.label}
            </ChamferLink>
          </ChamferPair>
        </div>
      </Container>
    </Section>
  );
}
