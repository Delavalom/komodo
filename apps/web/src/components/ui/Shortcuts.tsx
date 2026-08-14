"use client";

import { useMountEffect } from "@/lib/use-mount-effect";

/**
 * A window-level keydown listener that closes over whatever props it was
 * mounted with. Give it a `key` derived from the state the handler reads, so it
 * remounts with fresh values instead of holding a stale closure.
 *
 *   <Shortcuts key={`${i}-${composing}`} onKey={...} />
 *
 * Typing is never intercepted: events originating in an input, textarea, select
 * or contenteditable are ignored before `onKey` runs.
 */
export function Shortcuts({ onKey }: { onKey: (e: KeyboardEvent) => void }) {
  useMountEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      onKey(e);
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  return null;
}
