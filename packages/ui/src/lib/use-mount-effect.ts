"use client";

import { useEffect } from "react";

/**
 * Run an effect exactly once, on mount. The only sanctioned way to reach an
 * external system (window listeners, third-party widgets) in this codebase —
 * components never call `useEffect` directly.
 */
export function useMountEffect(effect: () => void | (() => void)) {
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(effect, []);
}
