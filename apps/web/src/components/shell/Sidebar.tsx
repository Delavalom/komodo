"use client";

import {
  ChartPie,
  ChevronsLeft,
  ChevronsRight,
  CreditCard,
  FileText,
  Gavel,
  LogOut,
  Plus,
  Settings,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@komodo/ui";

interface NavItem {
  href: string;
  label: string;
  icon: typeof FileText;
  /** Match only this exact path (used for "/" so it isn't always active). */
  exact?: boolean;
}

const PRIMARY: NavItem[] = [
  { href: "/queue", label: "Your queue", icon: Gavel },
  { href: "/analytics", label: "Analytics", icon: ChartPie },
  { href: "/", label: "Reviews", icon: FileText, exact: true },
  { href: "/new", label: "New review", icon: Plus },
];

const SECONDARY: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/credits", label: "Credits", icon: CreditCard },
];

export function Sidebar({
  login,
  name,
  avatarUrl,
  balance,
  collapsed,
  onToggleCollapsed,
}: {
  login: string;
  name?: string | null;
  avatarUrl?: string | null;
  balance: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const pathname = usePathname();

  function isActive(item: NavItem): boolean {
    return item.exact ? pathname === item.href : pathname.startsWith(item.href);
  }

  return (
    <aside className="sticky top-0 h-screen flex flex-col border-r border-border bg-surface overflow-hidden">
      {/* Brand + collapse */}
      <div className="flex items-center gap-2 h-14 px-3 border-b border-border shrink-0">
        <a href="/" className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-xl leading-none shrink-0">🦎</span>
          {!collapsed && (
            <span className="font-semibold text-[15px] tracking-tight text-text truncate">
              Komodo
            </span>
          )}
        </a>
        <button
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="shrink-0 p-1.5 rounded-md text-text-dim hover:text-text hover:bg-surface-2 transition-colors"
        >
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3">
        <NavGroup items={PRIMARY} collapsed={collapsed} isActive={isActive} />
        <div className="my-3 mx-3 border-t border-border" />
        <NavGroup items={SECONDARY} collapsed={collapsed} isActive={isActive} />

        {!collapsed && (
          <div className="mx-3 mt-4 rounded-lg border border-border bg-elevated px-3 py-2.5">
            <div className="text-[11px] text-text-dim">Credit balance</div>
            <div className="text-lg font-semibold text-accent tabular-nums mt-0.5">
              {balance.toLocaleString()}
            </div>
          </div>
        )}
      </nav>

      {/* User card */}
      <div className="border-t border-border p-3 shrink-0">
        <div className={cn("flex items-center gap-2.5", collapsed && "justify-center")}>
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="size-7 rounded-full shrink-0" />
          ) : (
            <div className="size-7 rounded-full bg-surface-2 shrink-0" />
          )}
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-text truncate">{name ?? login}</div>
                <div className="text-[11px] text-text-dim truncate">{login}</div>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/sign-in" })}
                aria-label="Sign out"
                title="Sign out"
                className="shrink-0 p-1.5 rounded-md text-text-dim hover:text-text hover:bg-surface-2 transition-colors"
              >
                <LogOut size={15} />
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

function NavGroup({
  items,
  collapsed,
  isActive,
}: {
  items: NavItem[];
  collapsed: boolean;
  isActive: (item: NavItem) => boolean;
}) {
  return (
    <div className="px-2 flex flex-col gap-0.5">
      {items.map((item) => {
        const active = isActive(item);
        const Icon = item.icon;
        return (
          <a
            key={item.href}
            href={item.href}
            title={collapsed ? item.label : undefined}
            className={cn(
              "relative flex items-center gap-2.5 h-9 rounded-lg text-[13px] transition-colors",
              collapsed ? "justify-center px-0" : "px-2.5",
              active
                ? "bg-surface-2 text-accent font-medium"
                : "text-text-muted hover:text-text hover:bg-surface-2",
            )}
          >
            {active && (
              <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-accent" />
            )}
            <Icon size={16} className="shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </a>
        );
      })}
    </div>
  );
}
