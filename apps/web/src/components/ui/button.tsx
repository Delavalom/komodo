"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Variant =
  | "brand"
  | "outline"
  | "secondary"
  | "ghost"
  | "destructive"
  | "white";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  brand:
    "bg-[hsl(var(--komodo-brand-green))] text-[hsl(var(--color-gray-950))] " +
    "hover:bg-[hsl(153_75%_63%)] border border-transparent font-medium",
  outline:
    "bg-card text-foreground border border-border hover:bg-muted-accent",
  secondary:
    "bg-secondary text-secondary-foreground border border-transparent hover:bg-muted-accent",
  ghost:
    "bg-transparent text-muted-foreground border border-transparent hover:bg-muted-accent hover:text-foreground",
  destructive:
    "bg-transparent text-[hsl(var(--destructive))] border border-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/0.12)]",
  white:
    "bg-white text-[hsl(var(--color-gray-950))] border border-transparent hover:bg-white/90 font-medium",
};

const SIZES: Record<Size, string> = {
  sm: "h-7 px-2 text-[13px] gap-1.5",
  md: "h-9 px-3 text-sm gap-2",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({
  className,
  variant = "outline",
  size = "md",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-[2px] whitespace-nowrap",
        "transition-colors duration-100 outline-none",
        "focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        "disabled:opacity-50 disabled:pointer-events-none",
        SIZES[size],
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

export function IconButton({
  className,
  variant = "ghost",
  ...props
}: ButtonProps) {
  return (
    <Button
      variant={variant}
      className={cn("h-8 w-8 p-0", className)}
      {...props}
    />
  );
}
