"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/display";
import { cn } from "@/lib/utils";

export interface SidebarItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: string;
  /** Anchor children revealed when the item is expanded. */
  children?: { href: string; label: string; icon: React.ReactNode }[];
}

export interface SidebarGroup {
  label?: string;
  items: SidebarItem[];
}

export function Sidebar({
  groups,
  header,
  footer,
  className,
}: {
  groups: SidebarGroup[];
  header?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "flex w-[267px] shrink-0 flex-col overflow-y-auto border-r border-border px-6 py-6",
        className,
      )}
    >
      {header ? <div className="mb-4">{header}</div> : null}

      {groups.map((group, index) => (
        <div key={group.label ?? index}>
          {index > 0 ? <div className="my-5 border-t border-border" /> : null}
          {group.label ? (
            <div className="mb-2 text-sm text-muted-foreground">
              {group.label}
            </div>
          ) : null}
          <nav className="space-y-0.5">
            {group.items.map((item) => (
              <SidebarLink
                key={item.href}
                item={item}
                pathname={pathname}
              />
            ))}
          </nav>
        </div>
      ))}

      {footer ? <div className="mt-auto pt-6">{footer}</div> : null}
    </aside>
  );
}

function SidebarLink({
  item,
  pathname,
}: {
  item: SidebarItem;
  pathname: string;
}) {
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const [expanded, setExpanded] = React.useState(active);
  const hasChildren = Boolean(item.children?.length);

  if (hasChildren) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            "flex h-9 w-full items-center gap-2.5 rounded-[2px] px-3 text-sm transition-colors duration-100",
            active
              ? "bg-muted-accent text-foreground"
              : "text-muted-foreground hover:bg-muted-accent hover:text-foreground",
          )}
        >
          <span className="shrink-0">{item.icon}</span>
          <span className="truncate">{item.label}</span>
          {item.badge ? <Badge>{item.badge}</Badge> : null}
          <ChevronRight
            className={cn(
              "ml-auto h-4 w-4 shrink-0 transition-transform duration-100",
              expanded ? "rotate-90" : "",
            )}
          />
        </button>
        {expanded ? (
          <div className="mt-0.5 space-y-0.5 pl-3">
            {item.children!.map((child) => (
              <Link
                key={child.href}
                href={child.href}
                className="flex h-9 items-center gap-2.5 rounded-[2px] px-3 text-sm text-muted-foreground transition-colors duration-100 hover:bg-muted-accent hover:text-foreground"
              >
                <span className="shrink-0">{child.icon}</span>
                <span className="truncate">{child.label}</span>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      className={cn(
        "flex h-9 items-center gap-2.5 rounded-[2px] px-3 text-sm transition-colors duration-100",
        active
          ? "bg-muted-accent text-foreground"
          : "text-muted-foreground hover:bg-muted-accent hover:text-foreground",
      )}
    >
      <span className="shrink-0">{item.icon}</span>
      <span className="truncate">{item.label}</span>
      {item.badge ? <Badge>{item.badge}</Badge> : null}
    </Link>
  );
}

export function SavedFooter() {
  return (
    <div className="flex items-center gap-2 border-t border-border pt-4 text-sm text-muted-foreground">
      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
        <path
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="m3 8.5 3.2 3.2L13 5"
        />
      </svg>
      All changes saved
    </div>
  );
}
