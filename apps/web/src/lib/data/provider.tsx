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

const SnapshotContext = createContext<QueueSnapshot | null>(null);

export function DataProvider({
  snapshot,
  children,
}: {
  snapshot: QueueSnapshot;
  children: ReactNode;
}) {
  return (
    <SnapshotContext.Provider value={snapshot}>
      {children}
    </SnapshotContext.Provider>
  );
}

export function useSnapshot(): QueueSnapshot {
  const snapshot = useContext(SnapshotContext);
  if (!snapshot) {
    throw new Error(
      "useSnapshot must be used inside <DataProvider>. The app shell layout " +
        "supplies it; a route outside (app)/ has none.",
    );
  }
  return snapshot;
}
