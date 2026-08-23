"use client";

/**
 * The decision queue.
 *
 * A review here is not a document to read — it is a stack of questions to
 * answer. One judgement at a time: what is true, what it costs, the code it
 * sits on, and the single question with four ways to answer it. Answering
 * advances; the answer is appended to a ledger that outlives the run.
 *
 * The four options are not a rating widget. Two are the real alternatives for
 * this judgement, the third asks the author a question, the fourth hands it to
 * someone else — the shape @komodo/core's schema has always described.
 *
 * Keyboard: 1–4 answer, ←/→ move, u withdraws. The handler lives on the
 * focused container rather than the document, because a document listener
 * would need an effect and AGENTS.md rule 6 forbids one.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { useAnswerJudgement, useVoteJudgement } from "@/lib/data/mutations";
import { usePersonalSettings } from "@/lib/data/queries";
import { useMountEffect } from "@/lib/use-mount-effect";
import { useUrlState } from "@/lib/use-url-state";
import { cn } from "@/lib/utils";
import type {
  Answer,
  Bucket,
  JudgementVote,
  Review,
  ReviewJudgement,
} from "@/lib/types";

import { ClosingScreen } from "./closing";
import { BUCKET_TONE, KIND_LABEL, SEVERITY_TONE } from "./labels";

export function DecisionQueue({
  review,
  judgements,
  answers,
  votes,
  prUrl,
}: {
  review: Review;
  judgements: ReviewJudgement[];
  answers: Answer[];
  votes: JudgementVote[];
  prUrl: string;
}) {
  const { get, set } = useUrlState();
  const router = useRouter();
  const answer = useAnswerJudgement();
  const vote = useVoteJudgement();
  const showFixPrompts = usePersonalSettings().showAiFixPrompts;

  // The URL names the judgement on screen, so a link into a review opens on
  // the one being discussed. AGENTS.md rule 7.
  //
  // The range runs one past the end: `j === judgements.length` is the closing
  // screen, which makes finishing a review a place you can link to and reload
  // onto rather than a state that only exists just after the last click.
  const last = judgements.length;
  const ordinal = clamp(Number(get("j") ?? 0), 0, last);
  const current = judgements[ordinal];
  const closing = ordinal === last;

  const answerFor = useMemo(() => {
    const byId = new Map<string, Answer>();
    for (const a of answers) byId.set(a.judgementId, a);
    return byId;
  }, [answers]);

  const votesFor = useMemo(() => {
    const byId = new Map<string, JudgementVote[]>();
    for (const v of votes) {
      const list = byId.get(v.judgementId);
      if (list) list.push(v);
      else byId.set(v.judgementId, [v]);
    }
    return byId;
  }, [votes]);

  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);

  // The shortcuts below are handled on this container, so they only fire once
  // it has focus. autoFocus would not do it: React applies that when it
  // creates a node, and this one arrives as server-rendered HTML that gets
  // hydrated. useMountEffect is the sanctioned way to own the one side effect
  // that puts focus where the keyboard contract says it is — AGENTS.md rule 6.
  const surface = useRef<HTMLDivElement>(null);
  useMountEffect(useCallback(() => surface.current?.focus(), []));

  if (!judgements.length) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        This run raised nothing to judge.{" "}
        <a href={prUrl} target="_blank" rel="noreferrer" className="underline">
          Open the pull request
        </a>
      </div>
    );
  }

  const given = current ? answerFor.get(current.id) : undefined;
  const answered = judgements.filter((j) => answerFor.get(j.id)?.bucket).length;

  const go = (to: number) => {
    setNote("");
    set({ j: to <= 0 ? null : String(clamp(to, 0, last)) });
  };

  const choose = async (option: { label: string; bucket: Bucket }) => {
    if (pending || !current) return;
    setPending(true);
    try {
      // "Asked" is the one answer that needs words: it is a question for the
      // author, and an empty one is not a question.
      if (option.bucket === "Asked" && !note.trim()) return;
      await answer({
        judgementId: current.id,
        bucket: option.bucket,
        optionLabel: option.label,
        note: option.bucket === "Asked" ? note.trim() : null,
        blocking: option.bucket === "Blocks",
      });
      router.refresh();
      // Including off the end of the last judgement, which is the whole point
      // of the closing screen: answering the final question finishes the
      // review rather than leaving you on it.
      go(ordinal + 1);
    } finally {
      setPending(false);
    }
  };

  /** Casting the same vote again withdraws it, which is what a toggle means. */
  const castVote = async (value: 1 | -1) => {
    if (pending || !current) return;
    setPending(true);
    try {
      const mine = votesFor.get(current.id)?.find((v) => v.value === value);
      await vote({ judgementId: current.id, value: mine ? null : value });
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  const withdraw = async () => {
    if (pending || !current) return;
    setPending(true);
    try {
      await answer({ judgementId: current.id, bucket: null });
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLTextAreaElement) return;
    if (event.key === "ArrowRight") go(ordinal + 1);
    else if (event.key === "ArrowLeft") go(ordinal - 1);
    else if (event.key === "u" && current) void withdraw();
    else if (/^[1-4]$/.test(event.key) && current) {
      const option = current.options[Number(event.key) - 1];
      if (option) void choose(option);
    } else return;
    event.preventDefault();
  };

  return (
    <div
      ref={surface}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="flex min-h-0 flex-1 flex-col outline-none"
    >
      <Progress
        judgements={judgements}
        answerFor={answerFor}
        ordinal={ordinal}
        answered={answered}
        onPick={go}
      />

      {closing || !current ? (
        <ClosingScreen
          review={review}
          judgements={judgements}
          answers={answers}
          onBack={() => go(last - 1)}
        />
      ) : (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[720px] px-6 py-8">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "label-mono text-[10px]",
                SEVERITY_TONE[current.severity],
              )}
            >
              {current.severity}
            </span>
            <span className="text-xs text-muted-foreground">
              {KIND_LABEL[current.kind]}
            </span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">{current.tag}</span>
            {current.postable ? null : (
              <Badge tone="outline" className="ml-auto">
                Not postable to GitHub
              </Badge>
            )}
          </div>

          <h1 className="mt-4 text-[22px] leading-snug">{current.title}</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
            {current.lede}
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            {current.detail}
          </p>

          <details className="mt-5 border border-border">
            <summary className="cursor-pointer px-3 py-2 text-[13px] text-muted-foreground">
              Show me the code
              <span className="ml-2 font-mono text-xs">
                {current.path}:{current.line}
                {current.endLine ? `–${current.endLine}` : ""}
              </span>
            </summary>
            <pre className="overflow-x-auto border-t border-border bg-muted-accent/40 px-3 py-2 font-mono text-xs whitespace-pre-wrap">
              {current.code || "No excerpt was recorded for this judgement."}
            </pre>
            {current.suggestion ? (
              <div className="border-t border-border">
                <div className="px-3 pt-2 text-[11px] text-muted-foreground">
                  Suggested replacement
                </div>
                <pre className="overflow-x-auto px-3 pb-2 font-mono text-xs whitespace-pre-wrap">
                  {current.suggestion}
                </pre>
              </div>
            ) : null}
          </details>

          <p className="mt-3 text-xs text-muted-foreground">
            Read from {current.sources.join(", ") || "the diff"}.{" "}
            {current.sourceNote}
          </p>

          <JudgementVoteBar
            votes={votesFor.get(current.id) ?? []}
            disabled={pending}
            onVote={castVote}
          />

          <h2 className="mt-8 text-[17px]">{current.ask}</h2>

          <div className="mt-4 flex flex-col gap-2">
            {current.options.map((option, i) => {
              const chosen = given?.bucket === option.bucket && !!given.bucket;
              return (
                <button
                  key={`${option.bucket}:${option.label}`}
                  type="button"
                  disabled={pending}
                  onClick={() => void choose(option)}
                  className={cn(
                    "group flex items-center gap-3 border px-3 py-2.5 text-left text-sm",
                    "transition-colors disabled:opacity-50",
                    chosen
                      ? "border-[hsl(var(--accent))] bg-[hsl(var(--accent)/0.08)]"
                      : "border-border hover:bg-muted-accent",
                  )}
                >
                  <kbd className="label-mono w-4 shrink-0 text-[10px] text-muted-foreground">
                    {i + 1}
                  </kbd>
                  <span className="flex-1">{option.label}</span>
                  <span
                    className={cn(
                      "label-mono text-[10px]",
                      BUCKET_TONE[option.bucket],
                    )}
                  >
                    {option.bucket}
                  </span>
                </button>
              );
            })}
          </div>

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Your question for the author — required to choose “I have a question first”"
            className={cn(
              "mt-3 w-full resize-y border border-border bg-transparent px-3 py-2 text-sm",
              "outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
            )}
          />

          {given?.bucket ? (
            <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
              <span>
                Answered “{given.optionLabel}” by {given.actorLogin}.
              </span>
              <Button size="sm" variant="ghost" onClick={() => void withdraw()}>
                Withdraw (u)
              </Button>
            </div>
          ) : null}

          {/* Personal, not org: whether YOU want a prompt to paste into an
              agent says nothing about whether your teammates do. The org
              setting of the same name governs what GitHub gets. */}
          <details className="mt-8" hidden={!showFixPrompts}>
            <summary className="cursor-pointer text-xs text-muted-foreground">
              Prompt for a coding agent
            </summary>
            <pre className="mt-2 overflow-x-auto border border-border px-3 py-2 font-mono text-xs whitespace-pre-wrap">
              {current.fixPrompt}
            </pre>
          </details>
        </div>
      </div>
      )}

      <div className="flex items-center justify-between border-t border-border px-6 py-3">
        <Button
          size="sm"
          variant="ghost"
          disabled={ordinal === 0}
          onClick={() => go(ordinal - 1)}
        >
          ← Previous
        </Button>
        <span className="text-xs text-muted-foreground">
          {answered} of {judgements.length} answered
        </span>
        <Button
          size="sm"
          variant="ghost"
          disabled={closing}
          onClick={() => go(ordinal + 1)}
        >
          {ordinal === last - 1 ? "Finish →" : "Next →"}
        </Button>
      </div>
    </div>
  );
}

/** One pip per judgement: where you are, and what is already decided. */
function Progress({
  judgements,
  answerFor,
  ordinal,
  answered,
  onPick,
}: {
  judgements: ReviewJudgement[];
  answerFor: Map<string, Answer>;
  ordinal: number;
  answered: number;
  onPick: (to: number) => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border px-6 py-3">
      <span className="label-mono text-[10px] text-muted-foreground">
        {ordinal >= judgements.length
          ? "done"
          : `${ordinal + 1} / ${judgements.length}`}
      </span>
      <div className="flex flex-1 items-center gap-1">
        {judgements.map((j, i) => {
          const bucket = answerFor.get(j.id)?.bucket;
          return (
            <button
              key={j.id}
              type="button"
              aria-label={`Judgement ${i + 1}${bucket ? `, ${bucket}` : ""}`}
              onClick={() => onPick(i)}
              className={cn(
                "h-1.5 flex-1 transition-colors",
                i === ordinal ? "ring-1 ring-[hsl(var(--ring))]" : "",
                bucket === "Blocks"
                  ? "bg-[hsl(var(--destructive))]"
                  : bucket
                    ? "bg-[hsl(var(--accent))]"
                    : "bg-muted-accent",
              )}
            />
          );
        })}
      </div>
      <span className="text-xs text-muted-foreground">{answered} answered</span>
    </div>
  );
}

/**
 * Was this judgement worth raising?
 *
 * A separate question from the answer above, and the reason it is separate is
 * the interesting half: a team needs to be able to say "good catch, but we
 * are not doing it", and an answer alone cannot. These votes are what the
 * comment-ratings panel on the analytics page counts — before this control
 * existed, that panel rendered a number nothing could produce.
 */
function JudgementVoteBar({
  votes,
  disabled,
  onVote,
}: {
  votes: JudgementVote[];
  disabled: boolean;
  onVote: (value: 1 | -1) => void;
}) {
  const up = votes.filter((v) => v.value === 1).length;
  const down = votes.length - up;

  const button = (value: 1 | -1, count: number, glyph: string, label: string) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onVote(value)}
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-1.5 border border-border px-2 py-1 text-xs",
        "text-muted-foreground transition-colors hover:text-foreground",
        "disabled:opacity-50",
        count > 0 && "text-foreground",
      )}
    >
      <span aria-hidden>{glyph}</span>
      {count > 0 ? count : null}
    </button>
  );

  return (
    <div className="mt-5 flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Worth raising?</span>
      {button(1, up, "\u25B2", "This judgement was worth raising")}
      {button(-1, down, "\u25BC", "This judgement was noise")}
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), Math.max(min, max));
}
