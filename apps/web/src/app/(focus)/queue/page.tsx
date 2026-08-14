import { redirect } from "next/navigation";
import { QueueScreen } from "@komodo/ui";
import { auth } from "@/auth";
import { loadQueue } from "@/lib/queue";
import { syncOpenThreads } from "@/lib/sync";

export default async function QueuePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  // Catch up on any replies before listing, so "answered" rows are truthful.
  // One GitHub call per pull request with an open thread; usually zero.
  await syncOpenThreads(session.user.id, session.accessToken).catch(() => {});

  return <QueueScreen entries={await loadQueue(session.user.id)} />;
}
