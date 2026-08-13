import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-bg hover:bg-accent-hover font-semibold",
  secondary: "bg-surface-2 text-text border border-border hover:border-border-strong hover:bg-hover",
  ghost: "text-text-muted hover:text-text hover:bg-surface-2",
  danger: "bg-critical/10 text-critical border border-critical/30 hover:bg-critical/20",
};

const SIZES: Record<Size, string> = {
  sm: "h-7 px-2.5 text-xs gap-1.5",
  md: "h-9 px-3.5 text-sm gap-2",
};

const BASE =
  "inline-flex items-center justify-center rounded-lg whitespace-nowrap transition-colors " +
  "disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none " +
  "focus-visible:ring-2 focus-visible:ring-accent/50";

export function Button({
  variant = "secondary",
  size = "md",
  className,
  children,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return (
    <button className={cn(BASE, VARIANTS[variant], SIZES[size], className)} {...props}>
      {children}
    </button>
  );
}

export function LinkButton({
  variant = "secondary",
  size = "md",
  className,
  children,
  ...props
}: ComponentProps<"a"> & { variant?: Variant; size?: Size; children: ReactNode }) {
  return (
    <a className={cn(BASE, VARIANTS[variant], SIZES[size], className)} {...props}>
      {children}
    </a>
  );
}
