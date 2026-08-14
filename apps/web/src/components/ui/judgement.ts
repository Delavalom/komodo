import type { Bucket, JudgementKind } from "@komodo/core";

/** Chip colours per judgement kind: text, border, background. */
export const KIND_TINT: Record<JudgementKind, { color: string; border: string; bg: string }> = {
  Choice: { color: "var(--color-text)", border: "var(--color-border-strong)", bg: "transparent" },
  Risk: { color: "#f97316", border: "rgba(249,115,22,0.35)", bg: "rgba(249,115,22,0.15)" },
  Behaviour: { color: "#eab308", border: "rgba(234,179,8,0.35)", bg: "rgba(234,179,8,0.15)" },
  Domain: { color: "#3b82f6", border: "rgba(59,130,246,0.35)", bg: "rgba(59,130,246,0.15)" },
  Unsure: { color: "var(--color-text-dim)", border: "var(--color-border-strong)", bg: "transparent" },
};

/** The "Reply" chip in the queue borrows Behaviour's yellow. */
export const REPLY_TINT = KIND_TINT.Behaviour;

export const BUCKET_TINT: Record<Bucket, string> = {
  Blocks: "var(--color-text)",
  Agreed: "var(--color-accent)",
  Asked: "#eab308",
  "Passed on": "#3b82f6",
};

export const BUCKET_ORDER: Bucket[] = ["Blocks", "Agreed", "Asked", "Passed on"];

/** Shared chip styling — mono, uppercase, tight. */
export const CHIP_CLASS =
  "font-mono text-[10px] font-bold tracking-[0.1em] uppercase rounded-[3px] px-[7px] py-0.5 " +
  "h-fit whitespace-nowrap border";

/** The small uppercase mono label used above each block of the judge screen. */
export const EYEBROW_CLASS =
  "font-mono text-[10px] tracking-[0.1em] uppercase text-text-faint";
