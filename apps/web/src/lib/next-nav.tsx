"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { NavProvider, type NavAdapter, type NavLinkProps } from "@komodo/ui";
import type { ReactNode } from "react";

/**
 * The cloud app's half of the navigation port: real Next routing behind the
 * interface packages/ui depends on. The CLI viewer supplies a hash-based
 * adapter instead, and the shared screens cannot tell the difference.
 */
function NextLink({ href, className, style, children }: NavLinkProps) {
  return (
    <Link href={href} className={className} style={style}>
      {children}
    </Link>
  );
}

export function NextNavProvider({ children }: { children: ReactNode }) {
  const router = useRouter();

  const adapter: NavAdapter = {
    Link: NextLink,
    push: (href) => router.push(href),
    refresh: () => router.refresh(),
  };

  return <NavProvider adapter={adapter}>{children}</NavProvider>;
}
