"use client";

import { useState, useTransition } from "react";
import type { JudgementView, ReviewActions } from "@komodo/core/store";
import { BUCKET_TINT, CHIP_CLASS, EYEBROW_CLASS, KIND_TINT, Shortcuts } from "../kit";
import { useNav } from "../nav";
import { JudgeHeader, type Pip } from "./JudgeHeader";

export function JudgeFlow({
  reviewId,
  prLabel,
  rows,
  startAt,
  actions,
}: {
  reviewId: string;
  prLabel: string;
  rows: JudgementView[];
  startAt: number;
  actions: ReviewActions;
}) {
  const { push } = useNav();
  const [i, setI] = useState(startAt);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const d = rows[i];
  const answered = d.bucket !== null;
  const answeredCount = rows.filter((r) => r.bucket !== null).length;
  const remaining = rows.length - answeredCount;

  function goNext() {
    const after = rows.findIndex((r, k) => k > i && r.bucket === null);
    if (after !== -1) return setI(after);
    const anywhere = rows.findIndex((r) => r.bucket === null);
    if (anywhere !== -1) return setI(anywhere);
    push(`/reviews/${reviewId}/close`);
  }

  function pick(n: number) {
    const option = d.options[n];
    if (!option || pending) return;
    setError(null);

    if (option.bucket === "Asked") {
      setDraft("");
      setComposing(true);
      return;
    }
    startTransition(async () => {
      try {
        await actions.answer(d.id, n);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not record that.");
      }
    });
  }

  function send(blocking: boolean) {
    if (!draft.trim() || pending) return;
    startTransition(async () => {
      try {
        const res = await actions.ask(d.id, draft, blocking);
        setComposing(false);
        setDraft("");
        if (!res.delivered) {
          setError(`Saved, but GitHub rejected it: ${res.error ?? "unknown error"}`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not send that.");
      }
    });
  }

  function undo() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      try {
        await actions.undoAnswer(d.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not change that.");
      }
    });
  }

  function onKey(e: KeyboardEvent) {
    if (composing) return;
    if (!answered && /^[1-4]$/.test(e.key)) {
      e.preventDefault();
      return pick(Number(e.key) - 1);
    }
    if (answered && e.key === "Enter") {
      e.preventDefault();
      return goNext();
    }
    if (e.key === "Backspace") {
      e.preventDefault();
      setI((cur) => Math.max(0, cur - 1));
    }
  }

  const pips: Pip[] = rows.map((r, k) => ({
    state: r.bucket !== null ? "done" : k === i ? "current" : "pending",
  }));
  const tint = KIND_TINT[d.kind];

  return (
    <>
      <Shortcuts key={`${i}:${composing}:${answered}`} onKey={onKey} />
      <JudgeHeader crumb={prLabel} pips={pips} counter={`${i + 1} / ${rows.length}`} />

      <div className="flex-1 w-full max-w-[760px] mx-auto px-6 pt-13 pb-14">
        {error && (
          <div className="mb-6 rounded-lg border border-major/30 bg-major/10 px-4 py-3 text-xs text-major">
            {error}
          </div>
        )}

        {answered ? (
          <Answered
            row={d}
            remaining={remaining}
            total={rows.length}
            pending={pending}
            onUndo={undo}
            onNext={goNext}
          />
        ) : (
          <div>
            <div className="flex items-center gap-2.5 mb-5">
              <span
                className={CHIP_CLASS}
                style={{ color: tint.color, borderColor: tint.border, background: tint.bg }}
              >
                {d.kind}
              </span>
              <span className="font-mono text-[11px] text-text-faint">{d.tag}</span>
            </div>

            <h2 className="font-serif font-normal text-[38px] leading-[1.3] text-text m-0 mb-6 text-pretty">
              {d.title}
            </h2>
            <p className="font-serif text-xl leading-[1.65] text-text-muted m-0 mb-3.5">{d.lede}</p>
            <p className="text-sm leading-[1.8] text-text-dim m-0 mb-7">{d.detail}</p>

            <div className="flex items-start gap-2 flex-wrap px-4 py-3.5 border border-border rounded-[10px] bg-elevated mb-7">
              <span className={`${EYEBROW_CLASS} mt-[5px] mr-1`}>Read from</span>
              {d.sources.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center h-6 px-2.5 rounded-md border border-border bg-surface-2 font-mono text-[11px] text-text-muted"
                >
                  {s}
                </span>
              ))}
              <div className="basis-full text-xs leading-[1.75] text-text-dim mt-1">
                {d.sourceNote}
              </div>
            </div>

            <div className="py-5 border-y border-border mb-7">
              <div className={`${EYEBROW_CLASS} mb-2.5`}>The question for you</div>
              <p className="font-serif text-[22px] leading-[1.5] text-text m-0">{d.ask}</p>
            </div>

            {composing ? (
              <div className="mb-5">
                <div className={`${EYEBROW_CLASS} mb-2.5`}>Your question to the author</div>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  autoFocus
                  placeholder="Plain language. What do you need to know before you can judge this?"
                  className="w-full box-border min-h-[110px] resize-y rounded-[10px] border border-border-strong bg-elevated text-text font-serif text-lg leading-relaxed px-4 py-3.5 outline-none focus:border-accent-border"
                />
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={() => send(false)}
                    disabled={pending || !draft.trim()}
                    className="inline-flex items-center h-[34px] px-4 rounded-[9px] bg-accent text-bg text-xs font-semibold disabled:opacity-50 hover:bg-accent-hover transition-colors"
                  >
                    Send and move on
                  </button>
                  <button
                    onClick={() => send(true)}
                    disabled={pending || !draft.trim()}
                    className="inline-flex items-center h-[34px] px-4 rounded-[9px] border border-border bg-surface-2 text-text-muted text-xs disabled:opacity-50 hover:text-text transition-colors"
                  >
                    Send and block merge
                  </button>
                  <button
                    onClick={() => setComposing(false)}
                    className="ml-auto text-xs text-text-faint hover:text-text-muted transition-colors"
                  >
                    cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2 mb-6">
                {d.options.map((o, n) => (
                  <button
                    key={o.label}
                    onClick={() => pick(n)}
                    disabled={pending}
                    className={`flex items-center gap-3 min-h-12 px-4.5 py-3 rounded-[10px] border text-sm leading-normal text-left transition-colors disabled:opacity-60 ${
                      n === 0
                        ? "border-border-strong bg-hover text-text"
                        : "border-border bg-surface text-text-muted hover:text-text hover:border-border-strong"
                    }`}
                  >
                    <span className="font-mono text-[11px] text-text-dim">{n + 1}</span>
                    {o.label}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between gap-4">
              <details className="group">
                <summary className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-dashed border-border-strong text-text-dim text-xs cursor-pointer list-none hover:text-text-muted transition-colors">
                  Show me the code
                </summary>
                <pre className="mt-3 mb-0 border border-border rounded-lg bg-elevated px-3.5 py-3 font-mono text-xs leading-[1.7] text-[#c9d1d9] overflow-x-auto">
                  {d.code}
                </pre>
              </details>
              <span className="text-xs text-text-faint">
                {i === 0
                  ? "answers are numbered 1–4 · no skipping"
                  : "← backspace · no skipping, use 4 if it isn't yours"}
              </span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function Answered({
  row,
  remaining,
  total,
  pending,
  onUndo,
  onNext,
}: {
  row: JudgementView;
  remaining: number;
  total: number;
  pending: boolean;
  onUndo: () => void;
  onNext: () => void;
}) {
  const isAsk = row.bucket === "Asked";
  const isBlock = row.bucket === "Blocks";
  const done = remaining === 0;

  return (
    <div>
      <div className="opacity-45 mb-6">
        <h2 className="font-serif font-normal text-[26px] leading-[1.35] text-text m-0">
          {row.title}
        </h2>
      </div>

      <div
        className="rounded-xl px-5 py-5 mb-6 border"
        style={{
          borderColor: isBlock ? "var(--color-border-strong)" : "var(--color-accent-border)",
          background: isBlock ? "var(--color-surface)" : "var(--color-accent-dim)",
        }}
      >
        <div
          className="font-mono text-[10px] tracking-[0.1em] uppercase mb-2.5"
          style={{ color: row.bucket ? BUCKET_TINT[row.bucket] : "var(--color-accent)" }}
        >
          {isAsk ? "Question sent · waiting on the author" : "Your judgement · recorded"}
        </div>

        <p className="font-serif text-[22px] leading-[1.5] text-text m-0 mb-3">{row.optionLabel}</p>

        {row.note && (
          <div className="rounded-lg border border-border bg-elevated px-3.5 py-3 text-[13px] leading-[1.75] text-text-muted">
            {row.note}
          </div>
        )}

        <div className="flex gap-2 mt-3.5">
          <button
            onClick={onUndo}
            disabled={pending || row.status === "awaiting_reply"}
            title={
              row.status === "awaiting_reply"
                ? "That question is already with the author."
                : undefined
            }
            className="inline-flex items-center h-7 px-3 rounded-[7px] border border-border bg-surface-2 text-text-muted text-xs disabled:opacity-40 hover:text-text transition-colors"
          >
            Change my answer
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <span className="text-[13px] text-text-dim">
          {done ? `All ${total} answered` : `${remaining} left`}
        </span>
        <button
          onClick={onNext}
          className="inline-flex items-center h-10 px-5 rounded-[10px] bg-accent text-bg text-[13px] font-semibold hover:bg-accent-hover transition-colors"
        >
          {done ? "See the review →" : "Next judgement →"}
        </button>
      </div>
    </div>
  );
}
