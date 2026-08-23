"use client";

import * as React from "react";
import { Info } from "lucide-react";
import Link from "next/link";

import { Card, PanelHeader } from "@/components/ui/card";
import { Avatar, GithubIcon, Tooltip } from "@/components/ui/display";
import { cn } from "@/lib/utils";
import type { LeaderRow } from "@/lib/types";

export function StatStrip({
  cells,
}: {
  cells: { label: string; value: string; hint?: string }[];
}) {
  return (
    <Card className="grid grid-cols-2 gap-y-6 p-6 sm:grid-cols-4 lg:grid-cols-[repeat(auto-fit,minmax(0,1fr))]">
      {cells.map((cell) => (
        <div key={cell.label}>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            {cell.label}
            {cell.hint ? <InfoHint>{cell.hint}</InfoHint> : null}
          </div>
          <div className="mt-2 text-3xl font-semibold tracking-tight">
            {cell.value}
          </div>
        </div>
      ))}
    </Card>
  );
}

export function InfoHint({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip content={children}>
      <Info className="h-3.5 w-3.5 text-muted-foreground" />
    </Tooltip>
  );
}

export function Panel({
  icon,
  title,
  control,
  hint,
  children,
  footerTitle,
  footer,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  control?: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
  footerTitle?: string;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <PanelHeader icon={icon} title={title}>
        {control ?? (hint ? <InfoHint>{hint}</InfoHint> : null)}
      </PanelHeader>
      <div className="px-4 py-4">{children}</div>
      {footerTitle ? (
        <div className="mt-auto border-t border-border p-5">
          <div className="text-sm font-medium">{footerTitle}</div>
          <div className="mt-3">{footer}</div>
        </div>
      ) : null}
    </Card>
  );
}

/** The `<github icon> delavalom/name … value` rows under every chart. §6.3 */
export function LeaderList({
  rows,
  emptyLabel = "No data available",
  after,
}: {
  rows: LeaderRow[];
  emptyLabel?: string;
  after?: React.ReactNode;
}) {
  if (rows.length === 0) {
    return (
      <div>
        <div className="flex h-[88px] items-center justify-center rounded-[2px] border border-dashed border-border text-sm text-muted-foreground">
          {emptyLabel}
        </div>
        {after}
      </div>
    );
  }
  return (
    <div>
      <ul className="space-y-2.5">
        {rows.map((row) => (
          <li
            key={row.label}
            className="flex items-center justify-between gap-4 text-sm"
          >
            <span className="flex min-w-0 items-center gap-2">
              {row.kind === "user" ? (
                <Avatar seed={row.label} label={row.label.slice(1)} size={16} />
              ) : (
                <GithubIcon className="h-4 w-4 shrink-0 text-foreground" />
              )}
              <span className="truncate">{row.label}</span>
            </span>
            <span className="shrink-0 text-muted-foreground">{row.value}</span>
          </li>
        ))}
      </ul>
      {after}
    </div>
  );
}

export function SeeAllBugsLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="mt-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
    >
      See all bugs caught
      <span aria-hidden>→</span>
    </Link>
  );
}
