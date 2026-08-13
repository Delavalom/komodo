"use client";

import { cn } from "./cn";

export interface Segment {
  id: string;
  label: string;
}

/** Pill group; the active segment gets a lighter fill. */
export function SegmentedTabs({
  segments,
  value,
  onChange,
  className,
}: {
  segments: Segment[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-border bg-elevated p-0.5",
        className,
      )}
    >
      {segments.map((s) => {
        const active = s.id === value;
        return (
          <button
            key={s.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(s.id)}
            className={cn(
              "rounded-md px-3 h-7 text-xs font-medium transition-colors",
              active
                ? "bg-surface-2 text-text border border-border"
                : "text-text-dim hover:text-text-muted border border-transparent",
            )}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
