import { Fragment } from "react";
import type { ReactNode } from "react";

export interface Crumb {
  label: string;
  href?: string;
}

/** `Org / Section / Page` trail shown at the left of the topbar. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm min-w-0">
      {items.map((item, i) => {
        const last = i === items.length - 1;
        const content: ReactNode = item.href && !last ? (
          <a href={item.href} className="text-text-dim hover:text-text transition-colors">
            {item.label}
          </a>
        ) : (
          <span className={last ? "text-text truncate" : "text-text-dim"}>{item.label}</span>
        );

        return (
          <Fragment key={`${item.label}-${i}`}>
            {i > 0 && <span className="text-text-faint select-none">/</span>}
            {content}
          </Fragment>
        );
      })}
    </nav>
  );
}
