"use client";

import { cn } from "./cn";

/** CodeRabbit-style switch: pill track, sliding knob, accent when on. */
export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
        "disabled:opacity-50 disabled:pointer-events-none",
        checked ? "bg-accent" : "bg-border-strong",
      )}
    >
      <span
        className={cn(
          "inline-block size-[18px] rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[26px]" : "translate-x-[3px]",
        )}
      />
    </button>
  );
}
