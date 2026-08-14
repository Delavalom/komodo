"use client";

import { createContext, useContext, type ComponentType, type ReactNode } from "react";

export interface NavLinkProps {
  href: string;
  className?: string;
  style?: React.CSSProperties;
  children: ReactNode;
}

/**
 * How a host app navigates.
 *
 * The shared flow screens need to link and redirect, but the two hosts do it
 * very differently: apps/web has the Next router and `next/link`, the CLI
 * viewer is a hash-routed SPA with no router at all. Rather than teach the
 * components about either, each host supplies this adapter.
 */
export interface NavAdapter {
  Link: ComponentType<NavLinkProps>;
  /** Go to `href`, adding a history entry. */
  push: (href: string) => void;
  /** Re-fetch the current screen's data in place. */
  refresh: () => void;
}

/** Plain-anchor fallback, good enough for the hash-routed CLI viewer. */
const defaultAdapter: NavAdapter = {
  Link: ({ href, className, style, children }: NavLinkProps) => (
    <a href={`#${href}`} className={className} style={style}>
      {children}
    </a>
  ),
  push: (href) => {
    window.location.hash = `#${href}`;
  },
  refresh: () => {
    window.dispatchEvent(new Event("komodo:refresh"));
  },
};

const NavContext = createContext<NavAdapter>(defaultAdapter);

export function NavProvider({ adapter, children }: { adapter: NavAdapter; children: ReactNode }) {
  return <NavContext.Provider value={adapter}>{children}</NavContext.Provider>;
}

export function useNav(): NavAdapter {
  return useContext(NavContext);
}
