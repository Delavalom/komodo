import { notFound, redirect } from "next/navigation";
import { CloseScreen } from "@komodo/ui";
import { auth } from "@/auth";
import { cloudActions } from "@/lib/cloud-actions";
import { loadReviewJudgements } from "@/lib/queue";

export default async function ClosePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const { id } = await params;
  const loaded = await loadReviewJudgements(id, session.user.id);
  if (!loaded) notFound();

  return <CloseScreen loaded={loaded} actions={cloudActions} />;
}
