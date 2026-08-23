"use client";

/**
 * Carries the server's snapshot to the client hooks.
 *
 * The hooks in lib/data/queries.ts used to read shared entities out of
 * Zustand. They read them from here instead — one line each — which is what
 * the read seam was built to allow. Filtering and the derived analytics stay
 * on the client, so a filtered table and its summary widgets still cannot
 * disagree.
 */
import { createContext, useContext, type ReactNode } from "react";

import type { QueueSnapshot } from "@komodo/store";

interface RequestData {
  snapshot: QueueSnapshot;
  /**
   * The clock, read once on the server and carried down.
   *
   * Every age on screen — how long a pull request has waited, whether it is
   * stale, the analytics window — is a subtraction from "now", and reading it
   * during render would give the server one answer and the client another,
   * which React calls a hydration error. The app used to answer that with a
   * constant pinned to the day the fixtures were captured: correct markup,
   * and every age wrong by however long ago that was. A request-scoped
   * timestamp is the same guarantee against a real clock.
   */
  now: number;
}

const DataContext = createContext<RequestData | null>(null);

export function DataProvider({
  snapshot,
  now,
  children,
}: {
  snapshot: QueueSnapshot;
  now: number;
  children: ReactNode;
}) {
  return (
    <DataContext.Provider value={{ snapshot, now }}>
      {children}
    </DataContext.Provider>
  );
}

function useData(): RequestData {
  const data = useContext(DataContext);
  if (!data) {
    throw new Error(
      "useSnapshot must be used inside <DataProvider>. The app shell layout " +
        "supplies it; a route outside (app)/ has none.",
    );
  }
  return data;
}

export function useSnapshot(): QueueSnapshot {
  return useData().snapshot;
}

/** When this page was rendered. The only clock a client component may read. */
export function useNow(): number {
  return useData().now;
}
