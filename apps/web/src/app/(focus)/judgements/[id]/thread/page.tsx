import { notFound, redirect } from "next/navigation";
import { ThreadScreen } from "@komodo/ui";
import { auth } from "@/auth";
import { cloudActions } from "@/lib/cloud-actions";
import { loadThread } from "@/lib/queue";
import { syncJudgementThread } from "@/lib/sync";

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const { id } = await params;

  // On-demand sync: there is no background worker, so the thread catches up
  // whenever someone opens it. Failures here are silent by design.
  await syncJudgementThread(id, session.user.id, session.accessToken).catch(() => {});

  const thread = await loadThread(id, session.user.id);
  if (!thread) notFound();

  return <ThreadScreen thread={thread} actions={cloudActions} />;
}
