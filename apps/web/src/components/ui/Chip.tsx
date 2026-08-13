import type { ReactNode } from "react";
import { cn } from "./cn";
import { CATEGORY_LABEL, SEVERITY_COLOR, SEVERITY_LABEL, isSeverity } from "./severity";

const BASE =
  "inline-flex items-center rounded-sm border px-2 py-px text-[10px] font-bold uppercase " +
  "tracking-[0.05em] leading-relaxed whitespace-nowrap";

export function SeverityChip({ severity }: { severity: string }) {
  const color = isSeverity(severity) ? SEVERITY_COLOR[severity] : "#6b7280";
  const label = isSeverity(severity) ? SEVERITY_LABEL[severity] : severity;
  return (
    <span
      className={BASE}
      style={{
        color,
        background: `color-mix(in srgb, ${color} 15%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}

export function CategoryChip({ category }: { category: string }) {
  return (
    <span
      className={cn(
        BASE,
        "bg-surface-2 text-text-muted border-border normal-case tracking-normal font-medium text-[11px]",
      )}
    >
      {CATEGORY_LABEL[category] ?? category}
    </span>
  );
}

/** Neutral pill — repo names, branches, models, file paths. */
export function Chip({
  children,
  mono = false,
  className,
}: {
  children: ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border border-border bg-surface-2 px-2 py-px",
        "text-[11px] text-text-muted whitespace-nowrap",
        mono && "font-mono",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Accent pill used for "New" / status markers. */
export function Badge({
  children,
  tone = "accent",
}: {
  children: ReactNode;
  tone?: "accent" | "neutral" | "warn";
}) {
  const tones = {
    accent: "bg-accent-dim text-accent border-accent-border",
    neutral: "bg-surface-2 text-text-dim border-border",
    warn: "bg-major/10 text-major border-major/30",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-px text-[10px] font-semibold",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
