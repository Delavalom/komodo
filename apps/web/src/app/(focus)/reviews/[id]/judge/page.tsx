import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { loadReviewJudgements } from "@/lib/queue";
import { JudgeFlow } from "./judge-flow";

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

  const { review, rows } = loaded;
  if (!rows.length) redirect(`/reviews/${id}/close`);

  const requested = Number(at);
  const startAt =
    Number.isInteger(requested) && requested >= 0 && requested < rows.length
      ? requested
      : Math.max(
          0,
          rows.findIndex((r) => r.bucket === null),
        );

  return (
    <JudgeFlow
      reviewId={review.id}
      prLabel={`#${review.number} · ${review.title}`}
      rows={rows}
      startAt={startAt}
    />
  );
}
