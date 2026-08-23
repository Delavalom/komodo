"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn, hashSeed, rangeLabel } from "@/lib/utils";
import { useDismiss } from "./use-dismiss";

/* ── Badges & pills ─────────────────────────────────────────────────────── */

export function Badge({
  children,
  tone = "brand",
  className,
}: {
  children: React.ReactNode;
  tone?: "brand" | "muted" | "outline";
  className?: string;
}) {
  const tones = {
    brand:
      "bg-[hsl(var(--komodo-brand-green))] text-[hsl(var(--color-gray-950))]",
    muted: "bg-muted-accent text-muted-foreground",
    outline: "border border-border text-muted-foreground",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-[2px] px-1.5 py-[1px] text-[11px] font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusPill({
  children,
  tone = "default",
  className,
}: {
  children: React.ReactNode;
  tone?: "default" | "warn" | "error" | "success";
  className?: string;
}) {
  const tones = {
    default: "text-muted-foreground",
    success: "text-[hsl(var(--success))]",
    warn: "text-[hsl(var(--warn))]",
    error: "text-[hsl(var(--error))]",
  } as const;
  return (
    <span className={cn("label-mono text-[11px]", tones[tone], className)}>
      {children}
    </span>
  );
}

/* ── Avatars — deterministic gradients, never a CDN. ───────────── */

function gradientFor(seed: string) {
  const h = hashSeed(seed);
  const a = h % 360;
  const b = (a + 40 + (h % 60)) % 360;
  return `linear-gradient(135deg, hsl(${a} 62% 46%), hsl(${b} 68% 32%))`;
}

export function Avatar({
  seed,
  label,
  size = 20,
  rounded = "sm",
  className,
}: {
  seed: string;
  label?: string;
  size?: number;
  rounded?: "sm" | "full";
  className?: string;
}) {
  const initial = (label ?? seed).trim().charAt(0).toUpperCase();
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        background: gradientFor(seed),
        fontSize: Math.max(9, Math.round(size * 0.46)),
      }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-medium text-white/90",
        rounded === "full" ? "rounded-full" : "rounded-[3px]",
        className,
      )}
    >
      {initial}
    </span>
  );
}

/* ── Icons the original uses that lucide doesn't carry ──────────────────── */

export function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={cn("h-4 w-4", className)}>
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
      />
    </svg>
  );
}

export function KomodoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("h-6 w-6", className)}>
      <path
        fill="hsl(var(--komodo-brand-green))"
        d="M16 2 30 10v12L16 30 2 22V10L16 2Z"
        opacity="0.28"
      />
      <path
        fill="hsl(var(--komodo-brand-green))"
        d="M16 4.6 27.4 11v10L16 27.4 4.6 21V11L16 4.6Zm0 3.1L7.4 12.6v7.2l4.9 2.8v-6l3.7-2.1 3.7 2.1v6l4.9-2.8v-7.2L16 7.7Z"
      />
    </svg>
  );
}

/* ── Empty state ────────────────────────────────────────────────────────── */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  dashed = false,
}: {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  dashed?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-6 py-12 text-center",
        dashed ? "rounded-[2px] border border-dashed border-border" : "",
        className,
      )}
    >
      {icon ? <div className="text-muted-foreground">{icon}</div> : null}
      {title ? <div className="text-base font-medium">{title}</div> : null}
      {description ? (
        <p className="max-w-[440px] text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/* ── Pagination — `1–10 of 30` + `‹ 1 2 3 ›`. ─────────────────── */

export function Pagination({
  page,
  perPage,
  total,
  pageCount,
  onPageChange,
}: {
  page: number;
  perPage: number;
  total: number;
  pageCount: number;
  onPageChange: (next: number) => void;
}) {
  const pages = Array.from({ length: pageCount }, (_, i) => i);
  return (
    <div className="flex items-center justify-between px-1 py-4 text-sm">
      <span className="text-muted-foreground">
        {rangeLabel(page, perPage, total)}
      </span>
      <div className="flex items-center gap-1">
        <PagerButton
          disabled={page === 0}
          onClick={() => onPageChange(page - 1)}
          label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </PagerButton>
        {pages.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            className={cn(
              "h-8 w-8 rounded-[2px] text-[13px] transition-colors duration-100",
              p === page
                ? "bg-muted-accent text-foreground"
                : "text-muted-foreground hover:bg-muted-accent hover:text-foreground",
            )}
          >
            {p + 1}
          </button>
        ))}
        <PagerButton
          disabled={page >= pageCount - 1}
          onClick={() => onPageChange(page + 1)}
          label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </PagerButton>
      </div>
    </div>
  );
}

function PagerButton({
  children,
  disabled,
  onClick,
  label,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-[2px] border border-border",
        "text-muted-foreground transition-colors duration-100",
        "hover:bg-muted-accent hover:text-foreground",
        "disabled:opacity-40 disabled:pointer-events-none",
      )}
    >
      {children}
    </button>
  );
}

/* ── Tooltip ────────────────────────────────────────────────────────────── */

export function Tooltip({
  content,
  children,
  side = "top",
  className,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "left";
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open ? (
        <span
          role="tooltip"
          className={cn(
            "pointer-events-none absolute z-50 w-max max-w-[280px] rounded-[2px]",
            "bg-[hsl(var(--color-gray-950))] px-2.5 py-1.5 text-xs leading-snug",
            "text-white shadow-lg",
            side === "top"
              ? "bottom-full left-1/2 mb-1.5 -translate-x-1/2"
              : "right-full top-1/2 mr-1.5 -translate-y-1/2",
          )}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}

/* ── Modal & Drawer ─────────────────────────────────────────────────────── */

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  width = 500,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}) {
  const ref = useDismiss<HTMLDivElement>(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ width }}
        className="max-h-[90vh] overflow-y-auto rounded-[2px] border border-border bg-card shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {icon}
              <h2 className="text-lg font-medium">{title}</h2>
            </div>
            {subtitle ? (
              <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <CloseGlyph />
          </button>
        </div>
        <div>{children}</div>
        {footer ? (
          <div className="border-t border-border p-4">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}

export function CloseGlyph() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4">
      <path
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        d="M3.5 3.5l9 9m0-9l-9 9"
      />
    </svg>
  );
}

/**
 * Right-side panel. The original PUSHES the table narrower rather than
 * overlaying it, so this is an in-flow column, not a fixed overlay.
 */
export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <aside className="flex w-[396px] shrink-0 flex-col border-l border-border bg-card">
      <div className="flex h-[62px] shrink-0 items-center justify-between border-b border-border px-5">
        <h2 className="text-lg font-medium">{title}</h2>
        <button
          type="button"
          aria-label="Close panel"
          onClick={onClose}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <CloseGlyph />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      {footer ? (
        <div className="shrink-0 border-t border-border p-4">{footer}</div>
      ) : null}
    </aside>
  );
}
