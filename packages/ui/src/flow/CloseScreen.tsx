"use client";

import {
  isBlocking,
  type Bucket,
  type ReviewActions,
  type ReviewJudgements,
} from "@komodo/core/store";
import { BUCKET_ORDER, BUCKET_TINT } from "../kit";
import { JudgeHeader } from "./JudgeHeader";
import { PostReview } from "./PostReview";

const BUCKET_LABEL: Record<Bucket, string> = {
  Blocks: "Blocks",
  Agreed: "Agreed",
  Asked: "Asked",
  "Passed on": "Passed on",
};

export function CloseScreen({
  loaded,
  actions,
}: {
  loaded: ReviewJudgements;
  actions: ReviewActions;
}) {
  const { review, judgements } = loaded;
  const live = judgements.filter((j) => j.status !== "withdrawn");
  const answered = live.filter((j) => j.bucket !== null);
  const unanswered = live.length - answered.length;

  const blocking = isBlocking(answered);
  const withdrawn = judgements.length - live.length;

  const groups = BUCKET_ORDER.map((bucket) => ({
    bucket,
    rows: answered.filter((j) => j.bucket === bucket),
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
                  color: bucket === "Blocks" ? "var(--color-text)" : "var(--color-text-muted)",
                }}
              >
                {inBucket.map((j) => j.title.replace(/\.$/, "")).join(" · ")}
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
          actions={actions}
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
