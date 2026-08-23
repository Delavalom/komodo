"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Building2,
  ChevronsUpDown,
  Gift,
  Inbox,
  LineChart,
  LogOut,
  Plus,
  Settings as SettingsIcon,
  SquarePen,
  Users,
} from "lucide-react";

import {
  Avatar,
  Badge,
  GreptileMark,
} from "@/components/ui/display";
import { Popover, PopoverItem } from "@/components/ui/controls";
import { InviteModal } from "@/components/shell/invite-modal";
import { useOrganization, usePersonalSettings } from "@/lib/data/queries";
import { cn } from "@/lib/utils";
import { MemoryNavIcon, PullRequestIcon } from "@/components/shell/nav-icons";

const DOCS_URL = "https://greptile.com/docs";

/** SPEC §2.2 + §2.3 */
export function OrgHeader() {
  const org = useOrganization();
  const [switcherOpen, setSwitcherOpen] = React.useState(false);

  return (
    <header className="shrink-0 border-b border-border">
      <div className="flex h-14 items-center gap-3 px-5">
        <Link href={`/${org.slug}`} aria-label={org.name}>
          <GreptileMark className="h-7 w-7" />
        </Link>

        <Popover
          open={switcherOpen}
          onOpenChange={setSwitcherOpen}
          panelClassName="w-[276px]"
          trigger={({ toggle }) => (
            <button
              type="button"
              onClick={toggle}
              className="flex items-center gap-2 rounded-[2px] px-2 py-1 transition-colors hover:bg-muted-accent"
            >
              <span className="text-[15px] font-medium">{org.name}</span>
              <Badge tone="muted">Admin</Badge>
              <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        >
          <div className="py-1">
            <PopoverItem selected onClick={() => setSwitcherOpen(false)}>
              <span className="flex items-center gap-2.5">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                {org.name}
              </span>
            </PopoverItem>
            <PopoverItem onClick={() => setSwitcherOpen(false)}>
              <span className="flex items-center gap-2.5 text-muted-foreground">
                <Users className="h-4 w-4" />
                Join a team
              </span>
            </PopoverItem>
            <PopoverItem onClick={() => setSwitcherOpen(false)}>
              <span className="flex items-center gap-2.5 text-muted-foreground">
                <Plus className="h-4 w-4" />
                Add organizations
              </span>
            </PopoverItem>
          </div>
        </Popover>

        <div className="ml-auto">
          <HeaderActions />
        </div>
      </div>

      <PrimaryNav orgSlug={org.slug} />
    </header>
  );
}

/** SPEC §2.6 — the org chrome is replaced entirely on personal settings. */
export function PersonalHeader() {
  const org = useOrganization();
  return (
    <header className="shrink-0 border-b border-border">
      <div className="flex h-14 items-center gap-4 px-5">
        <Link
          href={`/${org.slug}/-/pull-requests`}
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
            <path
              stroke="currentColor"
              strokeWidth="1.4"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10 3.5 5.5 8l4.5 4.5"
            />
          </svg>
          Back
        </Link>
        <span className="text-[15px] font-medium">Personal Settings</span>
        <div className="ml-auto">
          <HeaderActions />
        </div>
      </div>
    </header>
  );
}

function HeaderActions() {
  const personal = usePersonalSettings();
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);

  return (
    <div className="flex items-center gap-1">
      <a
        href={DOCS_URL}
        target="_blank"
        rel="noreferrer"
        aria-label="Docs"
        className="flex h-8 w-8 items-center justify-center rounded-[2px] text-muted-foreground transition-colors hover:bg-muted-accent hover:text-foreground"
      >
        <BookOpen className="h-4 w-4" />
      </a>
      <button
        type="button"
        aria-label="Refer a friend"
        onClick={() => setInviteOpen(true)}
        className="flex h-8 w-8 items-center justify-center rounded-[2px] text-muted-foreground transition-colors hover:bg-muted-accent hover:text-foreground"
      >
        <Gift className="h-4 w-4" />
      </button>

      <Popover
        open={menuOpen}
        onOpenChange={setMenuOpen}
        align="end"
        panelClassName="w-[286px]"
        trigger={({ toggle }) => (
          <button
            type="button"
            aria-label="Account menu"
            onClick={toggle}
            className="ml-1 rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          >
            <Avatar seed={personal.email} label={personal.name} size={28} />
          </button>
        )}
      >
        <div className="flex items-center gap-3 border-b border-border p-3">
          <Avatar seed={personal.email} label={personal.name} size={36} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{personal.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              {personal.email}
            </div>
          </div>
          <span className="flex h-7 w-7 items-center justify-center rounded-[2px] border border-border text-muted-foreground">
            <SquarePen className="h-3.5 w-3.5" />
          </span>
        </div>
        <div className="py-1">
          <Link
            href="/user/settings/account"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-muted-accent"
          >
            <SettingsIcon className="h-4 w-4 text-muted-foreground" />
            Settings
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-[hsl(var(--destructive))] transition-colors hover:bg-muted-accent"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </Popover>

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </div>
  );
}

const NAV = [
  { href: "queue", label: "Queue", short: "Queue", Icon: Inbox },
  { href: "analytics", label: "Analytics", short: "Analytics", Icon: LineChart },
  { href: "custom-context", label: "Memory", short: "Memory", Icon: MemoryNavIcon },
  {
    href: "pull-requests",
    label: "Pull Requests",
    short: "PRs",
    Icon: PullRequestIcon,
  },
  { href: "settings", label: "Settings", short: "Settings", Icon: SettingsIcon },
] as const;

function PrimaryNav({ orgSlug }: { orgSlug: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="flex items-center gap-1 px-5">
      {NAV.map(({ href, label, short, Icon }) => {
        const target = `/${orgSlug}/-/${href}`;
        const active = pathname.startsWith(target);
        return (
          <Link
            key={href}
            href={target}
            className={cn(
              "-mb-px flex items-center gap-2 border-b-2 px-2 pb-2.5 pt-1 text-sm transition-colors duration-100",
              active
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{short}</span>
          </Link>
        );
      })}
    </nav>
  );
}
