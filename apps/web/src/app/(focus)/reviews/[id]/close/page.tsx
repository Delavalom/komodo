import { notFound, redirect } from "next/navigation";
import type { Bucket } from "@komodo/core";
import { auth } from "@/auth";
import { BUCKET_ORDER, BUCKET_TINT } from "@/components/ui";
import { loadReviewJudgements } from "@/lib/queue";
import { JudgeHeader } from "../../../judge-header";
import { PostReview } from "./post-review";

const BUCKET_LABEL: Record<Bucket, string> = {
  Blocks: "Blocks",
  Agreed: "Agreed",
  Asked: "Asked",
  "Passed on": "Passed on",
};

export default async function ClosePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const { id } = await params;
  const loaded = await loadReviewJudgements(id, session.user.id);
  if (!loaded) notFound();

  const { review, rows } = loaded;
  const live = rows.filter((r) => r.status !== "withdrawn");
  const answered = live.filter((r) => r.bucket !== null);
  const unanswered = live.length - answered.length;

  const blocking = answered.some(
    (r) => r.bucket === "Blocks" || (r.bucket === "Asked" && r.blocking),
  );
  const withdrawn = rows.length - live.length;

  const groups = BUCKET_ORDER.map((bucket) => ({
    bucket,
    rows: answered.filter((r) => r.bucket === bucket),
  })).filter((g) => g.rows.length > 0);

  return (
    <>
      <JudgeHeader
        crumb={`#${review.number} · ${review.title}`}
        counter={`${answered.length} / ${live.length}`}
      />

      <div className="flex-1 w-full max-w-[760px] mx-auto px-6 pt-12 pb-14">
        <h2 className="font-serif font-normal text-[32px] leading-[1.35] text-text m-0 mb-2.5 text-pretty">
          {unanswered > 0
            ? `${unanswered} judgement${unanswered === 1 ? "" : "s"} still unanswered.`
            : blocking
              ? "Something here blocks this change."
              : "Nothing blocks this change."}
        </h2>

        <p className="text-sm leading-[1.8] text-text-dim m-0 mb-7">
          This is the review that posts to GitHub in your name — your words, in the order you gave
          them.
        </p>

        <div className="border-t border-border mb-7">
          {groups.map(({ bucket, rows: inBucket }) => (
            <div key={bucket} className="flex gap-4 py-3.5 border-b border-border">
              <span
                className="w-24 shrink-0 font-mono text-[10px] tracking-[0.08em] uppercase"
                style={{ color: BUCKET_TINT[bucket] }}
              >
                {BUCKET_LABEL[bucket]}
              </span>
              <span
                className="flex-1 text-sm leading-relaxed"
                style={{
                  color:
                    bucket === "Blocks" ? "var(--color-text)" : "var(--color-text-muted)",
                }}
              >
                {inBucket.map((r) => r.title.replace(/\.$/, "")).join(" · ")}
              </span>
            </div>
          ))}

          {groups.length === 0 && (
            <div className="py-6 text-sm text-text-dim">
              Nothing answered yet. Work through the queue first.
            </div>
          )}
        </div>

        <PostReview
          reviewId={review.id}
          blocking={blocking}
          disabled={unanswered > 0 || answered.length === 0}
          postedUrl={review.postedUrl}
          meta={[
            `${live.length} judgement${live.length === 1 ? "" : "s"}`,
            withdrawn > 0 ? `${withdrawn} withdrawn after a reply` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        />
      </div>
    </>
  );
}
