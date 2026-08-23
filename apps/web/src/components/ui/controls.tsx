"use client";

import * as React from "react";
import { Check, ChevronDown, ChevronsUpDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDismiss } from "./use-dismiss";

/* ── Toggle ─────────────────────────────────────────────────────────────── */

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
        "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-100",
        "outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        "disabled:opacity-50 disabled:pointer-events-none",
        checked ? "bg-foreground" : "bg-muted",
      )}
    >
      <span
        className={cn(
          "absolute top-1 h-4 w-4 rounded-full transition-all duration-100",
          checked
            ? "left-6 bg-[hsl(var(--background))]"
            : "left-1 bg-muted-foreground",
        )}
      />
    </button>
  );
}

/* ── Checkbox ───────────────────────────────────────────────────────────── */

export function Checkbox({
  checked,
  indeterminate,
  onChange,
  disabled,
  label,
  className,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  const on = checked || indeterminate;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[2px]",
        "border transition-colors duration-100 outline-none",
        "focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        "disabled:opacity-40 disabled:pointer-events-none",
        on
          ? "border-[hsl(var(--checkbox-checked))] bg-[hsl(var(--checkbox-checked))]"
          : "border-[hsl(var(--checkbox-border))] bg-transparent hover:border-[hsl(var(--checkbox-hover))]",
        className,
      )}
    >
      {indeterminate ? (
        <Minus className="h-3 w-3 text-white" strokeWidth={3} />
      ) : checked ? (
        <Check className="h-3 w-3 text-white" strokeWidth={3} />
      ) : null}
    </button>
  );
}

export function CheckboxField({
  checked,
  onChange,
  disabled,
  children,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "inline-flex cursor-pointer items-center gap-2 text-[13px]",
        disabled ? "cursor-default text-muted-foreground/60" : "text-foreground",
      )}
    >
      <Checkbox checked={checked} onChange={onChange} disabled={disabled} />
      <span>{children}</span>
    </label>
  );
}

/* ── Segmented control ──────────────────────────────────────────────────── */

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  className,
  size = "md",
}: {
  value: T;
  options: readonly { value: T; label: React.ReactNode }[];
  onChange: (next: T) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-[2px] border border-border bg-secondary p-0.5",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-[2px] transition-colors duration-100 outline-none",
              size === "sm" ? "h-6 px-2 text-xs" : "h-7 px-3 text-[13px]",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Popover ────────────────────────────────────────────────────────────── */

export function Popover({
  open,
  onOpenChange,
  trigger,
  children,
  align = "start",
  className,
  panelClassName,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: React.ReactNode;
  align?: "start" | "end";
  className?: string;
  panelClassName?: string;
}) {
  const close = React.useCallback(() => onOpenChange(false), [onOpenChange]);
  const ref = useDismiss<HTMLDivElement>(open, close);

  return (
    <div ref={ref} className={cn("relative", className)}>
      {trigger({ open, toggle: () => onOpenChange(!open) })}
      {open ? (
        <div
          className={cn(
            "absolute z-50 mt-1 min-w-[180px] rounded-[2px] border border-border",
            "bg-popover text-popover-foreground shadow-lg",
            align === "end" ? "right-0" : "left-0",
            panelClassName,
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function PopoverHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pt-2.5 pb-1.5 text-[13px] font-medium">{children}</div>
  );
}

export function PopoverItem({
  children,
  onClick,
  selected,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  selected?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm",
        "transition-colors duration-100 hover:bg-muted-accent",
        selected ? "bg-muted-accent" : "",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ── Select ─────────────────────────────────────────────────────────────── */

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  className,
  panelClassName,
  align = "end",
  size = "sm",
  placeholder,
}: {
  value: T | "";
  options: readonly SelectOption<T>[];
  onChange: (next: T) => void;
  className?: string;
  panelClassName?: string;
  align?: "start" | "end";
  size?: "sm" | "md";
  placeholder?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const current = options.find((o) => o.value === value);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align={align}
      panelClassName={cn("min-w-full", panelClassName)}
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className={cn(
            "flex items-center justify-between gap-2 rounded-[2px] border border-border",
            "bg-card text-foreground transition-colors duration-100 hover:bg-muted-accent",
            "outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
            size === "sm" ? "h-8 px-2.5 text-[13px]" : "h-9 px-3 text-sm",
            className,
          )}
        >
          <span className={current ? "" : "text-muted-foreground"}>
            {current?.label ?? placeholder ?? "Select"}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      )}
    >
      <div className="py-1">
        {options.map((option) => (
          <PopoverItem
            key={option.value}
            selected={option.value === value}
            onClick={() => {
              onChange(option.value);
              setOpen(false);
            }}
          >
            <span>{option.label}</span>
            {option.value === value ? <Check className="h-3.5 w-3.5" /> : null}
          </PopoverItem>
        ))}
      </div>
    </Popover>
  );
}

/* ── Multi-select filter button (Analytics) ─────────────────────────────── */

export function FilterMenuButton({
  icon,
  label,
  open,
  onToggle,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  open: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex h-9 items-center gap-2 rounded-[2px] border border-border bg-card px-3",
        "text-sm transition-colors duration-100 hover:bg-muted-accent",
        "outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        className,
      )}
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="max-w-[74px] truncate">{label}</span>
      <ChevronDown
        className={cn(
          "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-100",
          open ? "rotate-180" : "",
        )}
      />
    </button>
  );
}

/* ── Number stepper ─────────────────────────────────────────────────────── */

export function NumberStepper({
  value,
  onChange,
  min = 0,
  max = 10_000,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <div className="flex h-9 items-center rounded-[2px] border border-border bg-card">
      <input
        value={value}
        inputMode="numeric"
        onChange={(event) => {
          const parsed = Number(event.target.value.replace(/\D/g, ""));
          onChange(clamp(Number.isFinite(parsed) ? parsed : min));
        }}
        className="h-full w-[54px] bg-transparent px-2.5 text-sm outline-none"
      />
      <div className="flex h-full flex-col border-l border-border">
        <button
          type="button"
          aria-label="Increase"
          onClick={() => onChange(clamp(value + 1))}
          className="flex h-1/2 w-6 items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className="h-3 w-3 rotate-180" />
        </button>
        <button
          type="button"
          aria-label="Decrease"
          onClick={() => onChange(clamp(value - 1))}
          className="flex h-1/2 w-6 items-center justify-center border-t border-border text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
