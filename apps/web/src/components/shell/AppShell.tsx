"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { ToastProvider } from "@/components/ui";

const COLLAPSE_KEY = "komodo:sidebar-collapsed";

/** Read the persisted collapse state during first render — no effect needed. */
function initialCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(COLLAPSE_KEY) === "1";
}

/**
 * Two-column grid: sticky sidebar + scrolling content. Using a grid rather
 * than a fixed sidebar keeps the content offset in sync with the collapse
 * state automatically.
 */
export function AppShell({
  children,
  login,
  name,
  avatarUrl,
  balance,
}: {
  children: ReactNode;
  login: string;
  name?: string | null;
  avatarUrl?: string | null;
  balance: number;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <ToastProvider>
      <div
        className="grid min-h-screen transition-[grid-template-columns] duration-150"
        style={{ gridTemplateColumns: `${collapsed ? 64 : 260}px minmax(0, 1fr)` }}
      >
        <Sidebar
          login={login}
          name={name}
          avatarUrl={avatarUrl}
          balance={balance}
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
        />
        <div className="min-w-0 flex flex-col">{children}</div>
      </div>
    </ToastProvider>
  );
}
