import { cn } from "./cn";

const SEGMENT_SIZE = {
  sm: "w-3.5 h-1.5",
  md: "w-5 h-2",
  lg: "w-[26px] h-2.5",
} as const;

function colorFor(score: number): string {
  if (score >= 4) return "var(--color-accent)";
  if (score >= 3) return "var(--color-minor)";
  if (score >= 2) return "var(--color-major)";
  return "var(--color-critical)";
}

/**
 * Segmented 1–5 confidence bar. Ported from packages/ui — replaces the two
 * separate percentage-bar implementations that lived in the page files.
 */
export function ConfidenceMeter({
  score,
  size = "md",
  showLabel,
}: {
  score: number | null;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}) {
  const withLabel = showLabel ?? size !== "sm";

  if (score == null) {
    return <span className="text-xs text-text-faint">—</span>;
  }

  const color = colorFor(score);

  return (
    <div className="inline-flex items-center gap-2">
      <div className={cn("flex", size === "sm" ? "gap-0.5" : "gap-[3px]")}>
        {[1, 2, 3, 4, 5].map((seg) => (
          <div
            key={seg}
            className={cn("rounded-sm shrink-0", SEGMENT_SIZE[size])}
            style={{ background: seg <= score ? color : "var(--color-border-strong)" }}
          />
        ))}
      </div>
      {withLabel && (
        <span className="text-[13px] font-semibold tabular-nums" style={{ color }}>
          {score}/5
        </span>
      )}
    </div>
  );
}
