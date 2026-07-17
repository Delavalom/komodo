import type { Metadata } from "next";
import "./globals.css";
import { auth } from "@/auth";
import { SignOutButton } from "./sign-out-button";

export const metadata: Metadata = {
  title: "Komodo — AI Code Review",
  description: "AI-powered PR reviews backed by real GitHub tokens",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <html lang="en">
      <body className="min-h-screen" style={{ backgroundColor: "#0A0B0D", color: "#E5E7EB" }}>
        {session && (
          <nav
            style={{ borderBottom: "1px solid #1E2128", backgroundColor: "#111318" }}
            className="sticky top-0 z-50"
          >
            <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-6">
              <a href="/" className="flex items-center gap-2 font-semibold text-base">
                <span className="text-xl">🦎</span>
                <span style={{ color: "#3ECF8E" }}>Komodo</span>
              </a>

              <div className="flex items-center gap-1 ml-2">
                <NavLink href="/">Dashboard</NavLink>
                <NavLink href="/new">New review</NavLink>
                <NavLink href="/credits">Credits</NavLink>
              </div>

              <div className="ml-auto flex items-center gap-3">
                {session.user.avatarUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={(session.user as { avatarUrl?: string }).avatarUrl}
                    alt={session.user.login ?? ""}
                    className="w-7 h-7 rounded-full"
                  />
                )}
                <span style={{ color: "#9CA3AF" }} className="text-sm">
                  {(session.user as { login?: string }).login}
                </span>
                <SignOutButton />
              </div>
            </div>
          </nav>
        )}
        <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="px-3 py-1.5 rounded text-sm transition-colors nav-link"
      style={{ color: "#9CA3AF" }}
    >
      {children}
    </a>
  );
}
