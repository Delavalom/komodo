"use client";

import * as React from "react";
import {
  Building2,
  Code2,
  CreditCard,
  FileText,
  GitBranch,
  KeyRound,
  MessageSquare,
  Rocket,
  ScrollText,
  Settings as SettingsIcon,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from "lucide-react";

import { SavedFooter, Sidebar } from "@/components/shell/sidebar";
import { IS_CLOUD } from "@/lib/flags";
import { SearchInput } from "@/components/ui/input";
import { MemoryNavIcon } from "@/components/shell/nav-icons";
import { TrexIcon } from "@/components/ui/display";
import { CheckCircleIcon } from "@/components/settings/icons";

/** SPEC §8 */
export function SettingsSidebar({ orgSlug }: { orgSlug: string }) {
  const base = `/${orgSlug}/-/settings`;
  const [query, setQuery] = React.useState("");

  const groups = [
    {
      label: "Repositories",
      items: [
        {
          href: `${base}/manage-repos`,
          label: "Add/Remove Repos",
          icon: <GitBranch className="h-4 w-4" />,
        },
        {
          href: `${base}/repo`,
          label: "Settings",
          icon: <SettingsIcon className="h-4 w-4" />,
        },
        {
          href: `${base}/code-providers`,
          label: "Code Providers",
          icon: <Rocket className="h-4 w-4" />,
        },
      ],
    },
    {
      label: "Agent Config",
      items: [
        {
          href: `${base}/review`,
          label: "Code Review",
          icon: <Code2 className="h-4 w-4" />,
          children: [
            {
              href: `${base}/review#when-reviews`,
              label: "When Greptile Revie…",
              icon: <SlidersHorizontal className="h-4 w-4" />,
            },
            {
              href: `${base}/review#pr-summaries`,
              label: "PR Summaries",
              icon: <FileText className="h-4 w-4" />,
            },
            {
              href: `${base}/review#custom-instructions`,
              label: "Custom Instructions",
              icon: <ScrollText className="h-4 w-4" />,
            },
            {
              href: `${base}/review#greptile-comments`,
              label: "Greptile Comments",
              icon: <MessageSquare className="h-4 w-4" />,
            },
            {
              href: `${base}/review#coding-agents`,
              label: "Default Coding Agents",
              icon: <MemoryNavIcon className="h-4 w-4" />,
            },
            {
              href: `${base}/review#status-checks`,
              label: "Status Checks",
              icon: <CheckCircleIcon />,
            },
            {
              href: `${base}/review#auto-approve`,
              label: "Auto-approve PRs",
              icon: <ShieldCheck className="h-4 w-4" />,
            },
          ],
        },
        {
          href: `${base}/trex`,
          label: "TREX",
          icon: <TrexIcon className="h-4 w-4" />,
          badge: "Beta",
          children: [
            {
              href: `${base}/trex#trex`,
              label: "Settings",
              icon: <SettingsIcon className="h-4 w-4" />,
            },
          ],
        },
      ],
    },
    {
      label: "Features",
      items: [
        {
          href: `${base}/memory`,
          label: "Memory",
          icon: <MemoryNavIcon className="h-4 w-4" />,
        },
      ],
    },
    {
      label: "Admin",
      items: [
        {
          href: `${base}/organization`,
          label: "Organization",
          icon: <Building2 className="h-4 w-4" />,
        },
        {
          href: `${base}/people`,
          label: "People",
          icon: <Users className="h-4 w-4" />,
        },
        // Billing and metered usage are questions only a hosted tier asks.
        ...(IS_CLOUD
          ? [
              {
                href: `${base}/billing`,
                label: "Billing",
                icon: <CreditCard className="h-4 w-4" />,
              },
              {
                href: `${base}/usage`,
                label: "Usage",
                icon: <SlidersHorizontal className="h-4 w-4" />,
              },
            ]
          : []),
      ],
    },
    {
      label: "Developer",
      items: [
        {
          href: `${base}/api-keys`,
          label: "API Keys",
          icon: <KeyRound className="h-4 w-4" />,
        },
        ...(IS_CLOUD
          ? [
              {
                href: `${base}/audit-log`,
                label: "Audit Log",
                icon: <ScrollText className="h-4 w-4" />,
                badge: "Beta",
              },
            ]
          : []),
      ],
    },
  ];

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? groups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) =>
            item.label.toLowerCase().includes(needle),
          ),
        }))
        .filter((group) => group.items.length > 0)
    : groups;

  return (
    <Sidebar
      groups={filtered}
      header={
        <SearchInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search settings..."
          className="h-9"
        />
      }
      footer={<SavedFooter />}
    />
  );
}
