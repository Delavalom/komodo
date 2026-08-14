import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ToastProvider } from "@/components/ui";

/**
 * Focus mode: no sidebar, no breadcrumbs. One column, one decision at a time.
 * Each screen supplies its own 56px header.
 */
export default async function FocusLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  return (
    <ToastProvider>
      <div className="min-h-screen flex flex-col">{children}</div>
    </ToastProvider>
  );
}
