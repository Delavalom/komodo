import { notFound, redirect } from "next/navigation";
import { JudgeFlow } from "@komodo/ui";
import { auth } from "@/auth";
import { cloudActions } from "@/lib/cloud-actions";
import { loadReviewJudgements } from "@/lib/queue";

export default async function JudgePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ at?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const { id } = await params;
  const { at } = await searchParams;

  const loaded = await loadReviewJudgements(id, session.user.id);
  if (!loaded) notFound();

  const { review, judgements } = loaded;
  if (!judgements.length) redirect(`/reviews/${id}/close`);

  const requested = Number(at);
  const startAt =
    Number.isInteger(requested) && requested >= 0 && requested < judgements.length
      ? requested
      : Math.max(
          0,
          judgements.findIndex((j) => j.bucket === null),
        );

  return (
    <JudgeFlow
      reviewId={review.id}
      prLabel={`#${review.number} · ${review.title}`}
      rows={judgements}
      startAt={startAt}
      actions={cloudActions}
    />
  );
}
