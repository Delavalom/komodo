"use client";

import { estimateTime, type QueueEntry } from "@komodo/core/store";
import { CHIP_CLASS, KIND_TINT, REPLY_TINT } from "../kit";
import { useNav } from "../nav";
import { JudgeHeader } from "./JudgeHeader";
import { QueueShortcut } from "./QueueShortcut";

/** Where a queue entry sends you: an open thread, or the judgement itself. */
export function queueHref(entry: QueueEntry): string {
  return entry.judgement.status === "awaiting_reply"
    ? `/judgements/${entry.judgement.id}/thread`
    : `/reviews/${entry.review.id}/judge?at=${entry.judgement.ordinal}`;
}

export function QueueScreen({ entries }: { entries: QueueEntry[] }) {
  const { Link } = useNav();
  const top = entries[0];

  return (
    <>
      <JudgeHeader counter={`${entries.length} waiting`} />

      <div className="flex-1 w-full max-w-[760px] mx-auto px-6 pt-10 pb-16">
        <div className="flex items-baseline justify-between gap-4 mb-1.5">
          <h1 className="font-serif font-normal text-3xl leading-snug text-text m-0">
            {entries.length === 0
              ? "Nothing is waiting on you."
              : `${entries.length} judgement${entries.length === 1 ? "" : "s"} waiting on you`}
          </h1>
          {entries.length > 0 && (
            <span className="font-mono text-[11px] text-text-dim whitespace-nowrap">
              {estimateTime(entries.length)}
            </span>
          )}
        </div>

        <p className="text-[13px] leading-relaxed text-text-dim m-0 mb-7">
          {entries.length === 0 ? (
            <>
              Every judgement has been answered.{" "}
              <Link href="/new" className="text-accent hover:underline">
                Review another pull request
              </Link>
              .
            </>
          ) : (
            <>
              Judgements, not pull requests. Pick one, or press{" "}
              <span className="font-mono text-text-muted">↵</span> to take the top of the queue.
            </>
          )}
        </p>

        {top && <QueueShortcut href={queueHref(top)} />}

        <div className="border-t border-border">
          {entries.map((entry, i) => {
            const { judgement, review, hasReply } = entry;
            const isThread = judgement.status === "awaiting_reply";
            const tint = isThread ? REPLY_TINT : KIND_TINT[judgement.kind];

            const label = isThread
              ? hasReply
                ? `${review.owner}/${review.repo}#${review.number} · answered · read the reply`
                : `${review.owner}/${review.repo}#${review.number} · waiting on the author`
              : `${review.owner}/${review.repo}#${review.number} · ${judgement.tag}`;

            return (
              <Link
                key={judgement.id}
                href={queueHref(entry)}
                className="flex gap-3.5 px-1 py-4 border-b border-border transition-colors hover:bg-elevated"
                style={i === 0 ? { background: "var(--color-elevated)" } : undefined}
              >
                <span
                  className={CHIP_CLASS}
                  style={{ color: tint.color, borderColor: tint.border, background: tint.bg }}
                >
                  {isThread ? "Reply" : judgement.kind}
                </span>

                <div className="flex-1 min-w-0">
                  <div
                    className="font-serif text-[17px] leading-normal mb-1"
                    style={{ color: i === 0 ? "var(--color-text)" : "var(--color-text-muted)" }}
                  >
                    {isThread
                      ? `${judgement.title.replace(/\.$/, "")} — you asked a question.`
                      : judgement.title}
                  </div>
                  <div className="text-xs text-text-dim truncate">{label}</div>
                </div>

                <span
                  className="self-center font-mono text-[11px] whitespace-nowrap"
                  style={{ color: isThread ? REPLY_TINT.color : "var(--color-accent)" }}
                >
                  {isThread ? (hasReply ? "read →" : "waiting") : "judge →"}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
