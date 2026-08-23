"use client";

import { Pencil, Puzzle } from "lucide-react";
import { Sidebar } from "@/components/shell/sidebar";
import { MemoryNavIcon } from "@/components/shell/nav-icons";

function ClusterIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="1.3">
        <circle cx="3.2" cy="3.2" r="1.6" />
        <circle cx="12.8" cy="3.2" r="1.6" />
        <circle cx="8" cy="12.8" r="1.6" />
        <path d="M4.4 4.4 7.2 11.4M11.6 4.4 8.8 11.4M4.8 3.2h6.4" />
      </g>
    </svg>
  );
}

export function MemorySidebar({ orgSlug }: { orgSlug: string }) {
  const base = `/${orgSlug}/-/custom-context`;
  return (
    <Sidebar
      groups={[
        {
          label: "Memory",
          items: [
            {
              href: `${base}/context`,
              label: "Custom rules",
              icon: <Pencil className="h-4 w-4" />,
            },
            {
              href: `${base}/repo-clusters`,
              label: "Cross-repo context",
              icon: <ClusterIcon />,
            },
            {
              href: `${base}/knowledge-base`,
              label: "Knowledge Base",
              icon: <MemoryNavIcon className="h-4 w-4" />,
              badge: "Beta",
            },
            {
              href: `${base}/integrations`,
              label: "Integrations",
              icon: <Puzzle className="h-4 w-4" />,
            },
          ],
        },
      ]}
    />
  );
}
