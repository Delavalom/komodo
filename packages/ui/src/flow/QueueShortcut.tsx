"use client";

import { Shortcuts } from "../kit";
import { useNav } from "../nav";

/** Enter takes the top of the queue. Renders nothing. */
export function QueueShortcut({ href }: { href: string }) {
  const { push } = useNav();

  return (
    <Shortcuts
      key={href}
      onKey={(e) => {
        if (e.key !== "Enter") return;
        // Links and buttons handle their own Enter.
        const el = e.target as HTMLElement | null;
        if (el && /^(A|BUTTON)$/.test(el.tagName)) return;
        e.preventDefault();
        push(href);
      }}
    />
  );
}
