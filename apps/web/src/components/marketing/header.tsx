"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BookOpen,
  Building2,
  ChevronDown,
  DollarSign,
  GalleryVerticalEnd,
  Notebook,
  Sparkles,
} from "lucide-react";

import type { NavItem } from "@/lib/marketing-types";
import { cn } from "@/lib/utils";

import { ChamferLink, Container, MarkGlyph, MonoLabel } from "./ui";

/**
 * Sticky header. docs/SPEC-MARKETING.md §M2.2.
 *
 * The two `▾` items open on hover, not click, and close on pointer-leave —
 * which is why open state lives here rather than in the URL. No effect is
 * involved: the panel is opened and closed by pointer handlers, and Escape /
 * blur close it too so the menu is reachable from the keyboard.
 */
export function MarketingHeader({
  featureNav,
  resourceNav,
}: {
  featureNav: NavItem[];
  resourceNav: NavItem[];
}) {
  const [open, setOpen] = useState<"features" | "resources" | null>(null);

  return (
    <header
      className="sticky top-0 z-50 w-full border-b border-current/10 bg-mkt-sandbank/95 backdrop-blur"
      onPointerLeave={() => setOpen(null)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(null);
      }}
    >
      <Container className="relative">
        <div className="flex h-[74px] items-center justify-between gap-6">
          <Link href="/" aria-label="Greptile home" className="shrink-0">
            <MarkGlyph className="h-8 w-8" />
          </Link>

          <nav className="hidden items-center gap-1 lg:flex">
            <NavLink href="/examples" icon={<GalleryVerticalEnd size={14} />}>
              Examples
            </NavLink>
            <NavLink href="/pricing" icon={<DollarSign size={14} />}>
              Pricing
            </NavLink>
            <NavTrigger
              icon={<Sparkles size={14} />}
              active={open === "features"}
              onOpen={() => setOpen("features")}
            >
              Features
            </NavTrigger>
            <NavLink href="/enterprise" icon={<Building2 size={14} />}>
              Enterprise
            </NavLink>
            <NavLink href="/blog" icon={<BookOpen size={14} />}>
              Blog
            </NavLink>
            <NavTrigger
              icon={<Notebook size={14} />}
              active={open === "resources"}
              onOpen={() => setOpen("resources")}
            >
              Resources
            </NavTrigger>
          </nav>

          <ChamferLink
            href="https://app.greptile.com"
            tone="green"
            className="shrink-0"
          >
            Dashboard
          </ChamferLink>
        </div>

        {open === "features" ? (
          <DropdownPanel columns={2}>
            {featureNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(null)}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-mkt-basalt hover:text-mkt-white"
              >
                <span>{item.label}</span>
                {item.badge ? (
                  <MonoLabel className="bg-mkt-green px-1.5 py-0.5 text-[9px] text-mkt-basalt">
                    {item.badge}
                  </MonoLabel>
                ) : null}
              </Link>
            ))}
          </DropdownPanel>
        ) : null}

        {open === "resources" ? (
          <DropdownPanel columns={2}>
            {resourceNav.map((item) => (
              <NavPanelLink
                key={item.href}
                item={item}
                onNavigate={() => setOpen(null)}
              />
            ))}
          </DropdownPanel>
        ) : null}
      </Container>

      {/* Below the lg breakpoint the centre nav collapses to a scrolling rail
          rather than a hamburger — the original does the same. */}
      <div className="border-t border-current/10 lg:hidden">
        <div className="flex gap-1 overflow-x-auto px-4 py-2">
          {[
            { label: "Examples", href: "/examples" },
            { label: "Pricing", href: "/pricing" },
            { label: "Enterprise", href: "/enterprise" },
            { label: "Blog", href: "/blog" },
            ...featureNav.slice(0, 4).map((f) => ({
              label: f.label,
              href: f.href,
            })),
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="shrink-0 px-3 py-1 font-label text-[11px] uppercase tracking-[0.16em] opacity-70"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}

function NavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="chamfer-hex flex items-center gap-2 px-4 py-2 font-label text-[13px] uppercase tracking-[0.08em] transition-colors hover:bg-mkt-green"
    >
      <span className="opacity-70">{icon}</span>
      {children}
    </Link>
  );
}

function NavTrigger({
  icon,
  children,
  active,
  onOpen,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  active: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={active}
      onPointerEnter={onOpen}
      onFocus={onOpen}
      onClick={onOpen}
      className={cn(
        "chamfer-hex flex items-center gap-2 px-4 py-2 font-label text-[13px] uppercase tracking-[0.08em] transition-colors hover:bg-mkt-green",
        active && "bg-mkt-green",
      )}
    >
      <span className="opacity-70">{icon}</span>
      {children}
      <ChevronDown size={13} className="opacity-60" />
    </button>
  );
}

function DropdownPanel({
  children,
  columns,
}: {
  children: React.ReactNode;
  columns: 1 | 2;
}) {
  return (
    <div className="absolute left-1/2 top-full z-50 w-[min(46rem,calc(100vw-3rem))] -translate-x-1/2 border border-current/15 bg-mkt-sandbank shadow-[0_18px_40px_-24px_rgba(61,59,79,0.55)]">
      <div
        className={cn(
          "grid divide-current/10",
          columns === 2 ? "sm:grid-cols-2 sm:divide-x" : "grid-cols-1",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function NavPanelLink({
  item,
  onNavigate,
}: {
  item: NavItem;
  onNavigate: () => void;
}) {
  const content = (
    <>
      <span className="font-display text-sm font-semibold">{item.label}</span>
      {item.description ? (
        <span className="block pt-1 text-xs leading-relaxed opacity-65">
          {item.description}
        </span>
      ) : null}
    </>
  );
  const className =
    "block px-4 py-3 transition-colors hover:bg-mkt-basalt hover:text-mkt-white";

  if (item.external) {
    return (
      <a
        href={item.href}
        className={className}
        target="_blank"
        rel="noreferrer"
        onClick={onNavigate}
      >
        {content}
      </a>
    );
  }
  return (
    <Link href={item.href} className={className} onClick={onNavigate}>
      {content}
    </Link>
  );
}
