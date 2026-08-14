"use client";

import { useState, useTransition } from "react";
import type { ReviewActions } from "@komodo/core/store";
import { useNav } from "../nav";

export function PostReview({
  reviewId,
  blocking,
  disabled,
  postedUrl,
  meta,
  actions,
}: {
  reviewId: string;
  blocking: boolean;
  disabled: boolean;
  postedUrl: string | null;
  meta: string;
  actions: ReviewActions;
}) {
  const { push, refresh } = useNav();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cta = blocking ? "Post review · request changes" : "Post review · approve";

  function post() {
    setError(null);
    startTransition(async () => {
      const res = await actions.postReview(reviewId);
      if (res.error) {
        setError(res.error);
        setConfirming(false);
        return;
      }
      refresh();
    });
  }

  if (postedUrl) {
    return (
      <div className="flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center h-11 px-5 rounded-[10px] border border-accent-border bg-accent-dim text-accent text-sm font-semibold">
          Posted
        </span>
        <a
          href={postedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[13px] text-accent hover:underline"
        >
          View it on GitHub →
        </a>
        <span className="ml-auto text-xs text-text-faint">{meta}</span>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-lg border border-major/30 bg-major/10 px-4 py-3 text-xs text-major">
          {error}
        </div>
      )}

      {confirming && (
        <p className="mb-3 text-[13px] leading-relaxed text-text-muted">
          This posts to GitHub as you, and{" "}
          {blocking ? "requests changes on" : "approves"} the pull request. It cannot be undone from
          here.
        </p>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => (confirming ? post() : setConfirming(true))}
          disabled={disabled || pending}
          title={disabled ? "Answer every judgement first." : undefined}
          className="inline-flex items-center h-11 px-5 rounded-[10px] bg-accent text-bg text-sm font-semibold disabled:opacity-40 disabled:pointer-events-none hover:bg-accent-hover transition-colors"
        >
          {pending ? "Posting…" : confirming ? "Yes — post it" : cta}
        </button>

        {confirming ? (
          <button
            onClick={() => setConfirming(false)}
            className="inline-flex items-center h-11 px-4 rounded-[10px] border border-border bg-surface-2 text-text-muted text-[13px] hover:text-text transition-colors"
          >
            Not yet
          </button>
        ) : (
          <button
            onClick={() => push(`/reviews/${reviewId}/judge?at=0`)}
            className="inline-flex items-center h-11 px-4 rounded-[10px] border border-border bg-surface-2 text-text-muted text-[13px] hover:text-text transition-colors"
          >
            Go back through them
          </button>
        )}

        <span className="ml-auto text-xs text-text-faint">{meta}</span>
      </div>
    </div>
  );
}
