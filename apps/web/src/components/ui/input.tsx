"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-9 w-full rounded-[2px] border border-border bg-card px-3 text-sm",
        "text-foreground outline-none transition-colors duration-100",
        "focus:border-[hsl(var(--ring))] disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
});

export function SearchInput({
  className,
  wrapperClassName,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  wrapperClassName?: string;
}) {
  return (
    <div className={cn("relative", wrapperClassName)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input className={cn("pl-8", className)} {...props} />
    </div>
  );
}

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-[2px] border border-border bg-card p-3 text-sm",
        "text-foreground outline-none transition-colors duration-100",
        "focus:border-[hsl(var(--ring))] resize-y",
        className,
      )}
      {...props}
    />
  );
});
