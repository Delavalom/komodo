import type { Metadata } from "next";
import "./globals.css";
import { auth } from "@/auth";
import { getBalance } from "@/lib/credits";
import { AppShell } from "@/components/shell/AppShell";

export const metadata: Metadata = {
  title: "Komodo — AI Code Review",
  description: "AI-powered PR reviews backed by real GitHub tokens",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session?.user as { id?: string; login?: string; avatarUrl?: string } | undefined;

  // Signed out (sign-in page): render full-bleed with no shell chrome.
  if (!user?.id) {
    return (
      <html lang="en">
        <body className="min-h-screen">{children}</body>
      </html>
    );
  }

  const balance = await getBalance(user.id);

  return (
    <html lang="en">
      <body className="min-h-screen">
        <AppShell
          login={user.login ?? ""}
          name={session?.user?.name}
          avatarUrl={user.avatarUrl}
          balance={balance}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
