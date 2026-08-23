import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[2px] border border-border bg-card text-card-foreground",
        className,
      )}
      {...props}
    />
  );
}

/** The mono uppercase panel header used across Analytics. */
export function PanelHeader({
  icon,
  title,
  children,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-[62px] items-center justify-between gap-3 border-b border-border px-5",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5 text-muted-foreground">
        {icon}
        <span className="label-mono truncate text-[13px]">{title}</span>
      </div>
      {children}
    </div>
  );
}

/** `text-2xl` heading + muted subtitle — every settings section. */
export function SectionHeading({
  title,
  subtitle,
  badge,
  icon,
  id,
}: {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
  id?: string;
}) {
  return (
    <div id={id} className="scroll-mt-32">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-2xl font-medium tracking-tight">{title}</h2>
        {badge}
      </div>
      {subtitle ? (
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      ) : null}
    </div>
  );
}

/** A settings card row: title/description left, control right. */
export function SettingRow({
  title,
  description,
  control,
  children,
  className,
  icon,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  control?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-start justify-between gap-6">
        <div className="flex min-w-0 gap-3">
          {icon ? <div className="mt-0.5 shrink-0">{icon}</div> : null}
          <div className="min-w-0">
            <div className="text-base font-medium">{title}</div>
            {description ? (
              <div className="mt-1 max-w-[560px] text-sm text-muted-foreground">
                {description}
              </div>
            ) : null}
            {children}
          </div>
        </div>
        {control ? <div className="shrink-0">{control}</div> : null}
      </div>
    </Card>
  );
}

/** The muted explainer chip that tracks a segmented control. */
export function HintChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-2 inline-block rounded-[2px] bg-muted-accent px-2 py-1 text-xs text-muted-foreground">
      {children}
    </span>
  );
}
