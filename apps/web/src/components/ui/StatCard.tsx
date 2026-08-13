import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Metric tile — title top-left, oversized value below.
 * Renders an explicit "No data" state rather than a fake zero.
 */
export function StatCard({
  label,
  value,
  hint,
  accent,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: boolean;
  className?: string;
}) {
  const empty = value === null || value === undefined || value === "";

  return (
    <div className={cn("bg-surface border border-border rounded-xl p-4 flex flex-col", className)}>
      <div className="text-xs text-text-dim mb-3">{label}</div>
      {empty ? (
        <div className="text-lg text-text-faint">No data</div>
      ) : (
        <div
          className={cn(
            "text-3xl font-bold leading-none",
            accent ? "text-accent" : "text-text",
          )}
        >
          {value}
        </div>
      )}
      {/* Reserve the hint row even when absent, so values stay aligned across a row of cards. */}
      <div className="text-xs text-text-dim mt-2 min-h-4">{!empty && hint}</div>
    </div>
  );
}
