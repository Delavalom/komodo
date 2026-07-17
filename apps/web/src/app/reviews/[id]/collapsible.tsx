"use client";

import { useState } from "react";

export function Collapsible({
  label,
  children,
  defaultOpen = false,
}: {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: "1px solid #1E2128" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-left transition-colors"
        style={{ backgroundColor: "#111318", color: "#9CA3AF" }}
      >
        <span>{label}</span>
        <svg
          className="w-4 h-4 transition-transform"
          style={{ transform: open ? "rotate(180deg)" : undefined }}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="px-4 py-3" style={{ backgroundColor: "#0D0F12" }}>{children}</div>}
    </div>
  );
}
