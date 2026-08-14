"use client";

import { useTransition } from "react";
import type { ReviewActions } from "@komodo/core/store";
import { useNav } from "../nav";

export function ThreadActions({
  judgementId,
  reviewId,
  withdrawn,
  answered,
  actions,
}: {
  judgementId: string;
  reviewId: string;
  withdrawn: boolean;
  answered: boolean;
  actions: ReviewActions;
}) {
  const { push } = useNav();
  const [pending, startTransition] = useTransition();

  function close() {
    startTransition(async () => {
      await actions.closeThread(judgementId);
      push("/queue");
    });
  }

  const headline = withdrawn
    ? "Your question was answered and the decision changed. Nothing left to judge here."
    : answered
      ? "The author replied. Komodo still stands by this judgement."
      : "Waiting on the author. You can carry on with the rest of the queue.";

  return (
    <div
      className="rounded-[11px] px-4.5 py-4 border"
      style={{
        borderColor: withdrawn ? "var(--color-accent-border)" : "var(--color-border)",
        background: withdrawn ? "var(--color-accent-dim)" : "var(--color-surface)",
      }}
    >
      <p className="font-serif text-[19px] leading-[1.5] text-text m-0 mb-3">{headline}</p>

      <div className="flex gap-2 flex-wrap">
        {(withdrawn || answered) && (
          <button
            onClick={close}
            disabled={pending}
            className="inline-flex items-center h-8 px-3.5 rounded-lg bg-accent text-bg text-xs font-semibold disabled:opacity-50 hover:bg-accent-hover transition-colors"
          >
            Close it and continue
          </button>
        )}
        <button
          onClick={() => push("/queue")}
          className="inline-flex items-center h-8 px-3.5 rounded-lg border border-border bg-surface-2 text-text-muted text-xs hover:text-text transition-colors"
        >
          {withdrawn || answered ? "Keep it open" : "Back to the queue"}
        </button>
        <button
          onClick={() => push(`/reviews/${reviewId}/judge`)}
          className="inline-flex items-center h-8 px-3.5 rounded-lg text-text-faint text-xs hover:text-text-muted transition-colors"
        >
          Rest of this pull request →
        </button>
      </div>
    </div>
  );
}
