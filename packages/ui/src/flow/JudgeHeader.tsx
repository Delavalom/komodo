"use client";

import { useNav } from "../nav";

export interface Pip {
  /** Answered, current, or still ahead of you. */
  state: "done" | "current" | "pending";
}

const PIP_BG: Record<Pip["state"], string> = {
  done: "bg-accent",
  current: "bg-text",
  pending: "bg-border-strong",
};

/**
 * The 56px focus-mode header: where you are, how far through, how much is left.
 * Deliberately not the app's PageHeader — no breadcrumb trail, no actions.
 */
export function JudgeHeader({
  crumb,
  pips,
  counter,
}: {
  crumb?: string;
  pips?: Pip[];
  counter: string;
}) {
  const { Link } = useNav();

  return (
    <header className="h-14 shrink-0 flex items-center justify-between gap-4 px-5 border-b border-border bg-surface">
      <div className="flex items-center gap-2.5 text-[13px] text-text-muted min-w-0">
        <span className="text-base leading-none">🦎</span>
        <Link href="/queue" className="text-text-muted hover:text-text transition-colors shrink-0">
          Your queue
        </Link>
        {crumb && (
          <>
            <span className="text-border-strong">/</span>
            <span className="text-text truncate">{crumb}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {pips && pips.length > 0 && (
          <div className="hidden sm:flex gap-1" aria-hidden>
            {pips.map((p, i) => (
              <span key={i} className={`w-[26px] h-1 rounded-sm ${PIP_BG[p.state]}`} />
            ))}
          </div>
        )}
        <span className="font-mono text-[11px] text-text-dim tabular-nums">{counter}</span>
      </div>
    </header>
  );
}
