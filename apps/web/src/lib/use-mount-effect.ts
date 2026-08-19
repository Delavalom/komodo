"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

/**
 * Run something once, on mount, without useEffect — the subscribe callback of
 * useSyncExternalStore is the sanctioned place to own a side effect.
 * Pass a `useCallback`-stable function.
 */
export function useMountEffect(effect: () => void) {
  const ran = useRef(false);

  const subscribe = useCallback(() => {
    if (!ran.current) {
      ran.current = true;
      effect();
    }
    return () => {};
  }, [effect]);

  const snapshot = useCallback(() => true, []);
  useSyncExternalStore(subscribe, snapshot, snapshot);
}
