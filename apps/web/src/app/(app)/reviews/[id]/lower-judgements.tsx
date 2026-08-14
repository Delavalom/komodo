"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/components/ui";

/** Collapsed group for minor/trivial judgements, so the high-severity list stays scannable. */
export function LowerJudgements({ count, children }: { count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2.5">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 py-1.5 text-xs text-text-muted hover:text-text transition-colors"
      >
        <ChevronRight
          size={12}
          className={cn("text-text-faint transition-transform", open && "rotate-90")}
        />
        Lower priority ({count})
      </button>
      {open && children}
    </div>
  );
}
