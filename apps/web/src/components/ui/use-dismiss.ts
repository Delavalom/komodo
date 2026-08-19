"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

/**
 * Owns the document listeners that close a popover/menu through
 * useSyncExternalStore's subscribe contract — no useEffect. The snapshot is
 * constant; we subscribe purely for the side effect.
 */
export function useDismiss<T extends HTMLElement>(
  open: boolean,
  onDismiss: () => void,
) {
  const ref = useRef<T | null>(null);

  const subscribe = useCallback(() => {
    if (!open) return () => {};
    const onPointerDown = (event: MouseEvent) => {
      const node = ref.current;
      if (node && !node.contains(event.target as Node)) onDismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    document.addEventListener("mousedown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, onDismiss]);

  const snapshot = useCallback(() => open, [open]);
  useSyncExternalStore(subscribe, snapshot, snapshot);

  return ref;
}
