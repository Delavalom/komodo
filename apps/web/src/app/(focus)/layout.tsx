import { redirect } from "next/navigation";
import { ToastProvider } from "@komodo/ui";
import { auth } from "@/auth";
import { NextNavProvider } from "@/lib/next-nav";

/**
 * Focus mode: no sidebar, no breadcrumbs. One column, one decision at a time.
 * Each screen supplies its own 56px header.
 *
 * The nav provider is what lets the shared screens in @komodo/ui route through
 * Next here, and through the hash router in the CLI viewer.
 */
export default async function FocusLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  return (
    <NextNavProvider>
      <ToastProvider>
        <div className="min-h-screen flex flex-col">{children}</div>
      </ToastProvider>
    </NextNavProvider>
  );
}
