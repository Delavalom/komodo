import Link from "next/link";

import type { NavItem } from "@/lib/marketing-types";

import { Container, MonoLabel, Wordmark } from "./ui";

/* ══ Announcement bar ═══════════════════════════════════════ §M2.1 ══ */

export function AnnouncementBar() {
  return (
    <div className="w-full bg-mkt-green">
      <Container>
        <div className="flex items-center justify-center gap-3 py-3 text-center">
          <DinoGlyph />
          <p className="font-label text-[13px] tracking-[0.02em] text-mkt-basalt">
            Introducing TREX: Greptile Now Runs Your Code.{" "}
            <Link href="/blog/trex" className="underline underline-offset-4">
              Learn More
            </Link>{" "}
            <span aria-hidden>→</span>
          </p>
        </div>
      </Container>
    </div>
  );
}

/** A small line-drawn theropod, in the announcement bar and the TREX pages. */
function DinoGlyph({ className = "h-4 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 20" aria-hidden className={className}>
      <path
        fill="none"
        stroke="#3d3b4f"
        strokeWidth="1.2"
        strokeLinejoin="round"
        d="M3 6c2-3 6-4 9-3l5 2 4-1 3 2-2 2 3 2-4 1-1 3-3 2-2-2-2 3-3-1 1-3-4-1-2-3 2-1-2-2Z"
      />
      <circle cx="9" cy="6" r="0.9" fill="#3d3b4f" />
    </svg>
  );
}

/* ══ Footer ═════════════════════════════════════════════════ §M2.3 ══ */

export function MarketingFooter({
  columns,
}: {
  columns: { heading: string; links: NavItem[] }[];
}) {
  return (
    <footer className="relative w-full overflow-hidden border-t border-current/10">
      <div className="dotgrid absolute inset-0" aria-hidden />
      <Container className="relative">
        <div className="grid gap-10 py-16 lg:grid-cols-[minmax(0,1fr)_repeat(4,minmax(0,1fr))]">
          <div className="flex flex-col justify-between gap-8">
            <div className="relative">
              <div className="hatch absolute inset-0 opacity-40" aria-hidden />
              <Wordmark className="relative block text-5xl lg:text-6xl" />
            </div>
            <div>
              <MonoLabel className="block opacity-55">Status</MonoLabel>
              <Link
                href="/status"
                className="mt-2 inline-flex items-center gap-2 font-label text-[11px] uppercase tracking-[0.18em] underline underline-offset-4"
              >
                <span className="h-2 w-2 rounded-full bg-mkt-green" />
                Operational
              </Link>
            </div>
          </div>

          {columns.map((column) => (
            <div key={column.heading} className="border-l border-current/10 pl-6">
              <MonoLabel className="block opacity-55">
                {column.heading}
              </MonoLabel>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={`${column.heading}-${link.label}`}>
                    <FooterLink item={link} />
                  </li>
                ))}
              </ul>
              {column.heading === "Support" ? <Socials /> : null}
            </div>
          ))}
        </div>
      </Container>

      {/* The tiled isometric-cube band. §M2.3 */}
      <div className="cube-band h-56 w-full opacity-70" aria-hidden />

      <Container>
        <div className="flex justify-end py-4">
          <MonoLabel className="opacity-45">© 2026 Tabnam, Inc.</MonoLabel>
        </div>
      </Container>
    </footer>
  );
}

function FooterLink({ item }: { item: NavItem }) {
  const className =
    "font-label text-[11px] uppercase tracking-[0.14em] opacity-70 transition-opacity hover:opacity-100";
  if (item.external) {
    return (
      <a href={item.href} target="_blank" rel="noreferrer" className={className}>
        {item.label}
      </a>
    );
  }
  return (
    <Link href={item.href} className={className}>
      {item.label}
    </Link>
  );
}

function Socials() {
  return (
    <div className="mt-8">
      <MonoLabel className="block opacity-55">Socials</MonoLabel>
      <div className="mt-3 flex gap-3">
        {SOCIALS.map((s) => (
          <a
            key={s.label}
            href={s.href}
            target="_blank"
            rel="noreferrer"
            aria-label={s.label}
            className="opacity-55 transition-opacity hover:opacity-100"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
              <path fill="currentColor" d={s.path} />
            </svg>
          </a>
        ))}
      </div>
    </div>
  );
}

/* Generic glyphs drawn here rather than shipped as brand asset files. */
const SOCIALS = [
  {
    label: "Source repository",
    href: "https://github.com",
    path: "M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.36 1.09 2.94.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z",
  },
  {
    label: "Posts",
    href: "https://x.com",
    path: "M18.24 2H21l-6.55 7.49L22 22h-6.16l-4.83-6.3L5.5 22H2.74l7-8-7.4-12h6.32l4.37 5.77L18.24 2Zm-.97 18h1.7L7.8 3.9H6l11.27 16.1Z",
  },
  {
    label: "Company profile",
    href: "https://linkedin.com",
    path: "M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm6 0h3.8v1.7h.05c.53-.95 1.83-1.95 3.77-1.95 4.03 0 4.78 2.53 4.78 5.82V21h-4v-5.5c0-1.31-.02-3-1.9-3-1.9 0-2.19 1.42-2.19 2.9V21H9V9Z",
  },
  {
    label: "Community chat",
    href: "https://discord.com",
    path: "M19.3 5.4A16.7 16.7 0 0 0 15.2 4l-.2.4c1.4.35 2.5.9 3.5 1.55A13.4 13.4 0 0 0 12 4.9c-2.4 0-4.5.5-6.5 1.05C6.5 5.3 7.6 4.75 9 4.4L8.8 4C7.3 4.3 5.9 4.75 4.7 5.4 2.5 8.7 1.9 11.9 2.2 15.05A16.6 16.6 0 0 0 7.3 17.6l.9-1.35c-.85-.3-1.6-.7-2.3-1.2l.5-.35c2.2 1.05 4.3 1.55 5.6 1.55s3.4-.5 5.6-1.55l.5.35c-.7.5-1.45.9-2.3 1.2l.9 1.35c1.9-.6 3.6-1.45 5.1-2.55.35-3.65-.6-6.85-2.5-9.65ZM9.1 13.4c-.95 0-1.75-.9-1.75-2s.8-2 1.75-2 1.75.9 1.75 2-.8 2-1.75 2Zm5.8 0c-.95 0-1.75-.9-1.75-2s.8-2 1.75-2 1.75.9 1.75 2-.8 2-1.75 2Z",
  },
];
