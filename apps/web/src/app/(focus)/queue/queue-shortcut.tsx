"use client";

import { useRouter } from "next/navigation";
import { Shortcuts } from "@/components/ui";

/** Enter takes the top of the queue. Renders nothing. */
export function QueueShortcut({ href }: { href: string }) {
  const router = useRouter();

  return (
    <Shortcuts
      key={href}
      onKey={(e) => {
        if (e.key !== "Enter") return;
        // Links and buttons handle their own Enter.
        const el = e.target as HTMLElement | null;
        if (el && /^(A|BUTTON)$/.test(el.tagName)) return;
        e.preventDefault();
        router.push(href);
      }}
    />
  );
}
