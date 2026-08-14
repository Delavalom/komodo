import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Title + description on the left, control right-aligned.
 * The workhorse layout of CodeRabbit's settings screens.
 */
export function SettingRow({
  title,
  description,
  control,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  control?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("px-5 py-4 border-b border-border last:border-b-0", className)}>
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="text-sm font-medium text-text">{title}</div>
          {description && (
            <p className="text-xs text-text-dim mt-1 leading-relaxed max-w-xl">{description}</p>
          )}
        </div>
        {control && <div className="shrink-0 pt-0.5">{control}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

/** Card wrapper whose children are SettingRows. */
export function SettingGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border">
        <h2 className="text-sm font-semibold text-text">{title}</h2>
      </div>
      {children}
    </div>
  );
}
