import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getBalance } from "@/lib/credits";
import { AppShell } from "@/components/shell/AppShell";

/** Everything under the sidebar chrome. The focus flow lives in (focus). */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session?.user as { id?: string; login?: string; avatarUrl?: string } | undefined;
  if (!user?.id) redirect("/sign-in");

  const balance = await getBalance(user.id);

  return (
    <AppShell
      login={user.login ?? ""}
      name={session?.user?.name}
      avatarUrl={user.avatarUrl}
      balance={balance}
    >
      {children}
    </AppShell>
  );
}
