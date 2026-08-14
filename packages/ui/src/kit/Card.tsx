import type { ReactNode } from "react";
import { cn } from "./cn";

export function Card({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={cn(
        "bg-surface border border-border rounded-xl",
        padded && "p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Header strip for a card whose body is a table or a list of rows. */
export function CardHeader({
  title,
  action,
  className,
}: {
  title: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-4 py-3 border-b border-border",
        className,
      )}
    >
      <h2 className="text-sm font-semibold text-text">{title}</h2>
      {action}
    </div>
  );
}

/** Small uppercase label used above card content blocks. */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2
      className={cn(
        "text-[11px] font-semibold uppercase tracking-[0.09em] text-text-dim",
        className,
      )}
    >
      {children}
    </h2>
  );
}
