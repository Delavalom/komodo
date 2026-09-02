"use client";

/**
 * The end of the queue.
 *
 * A review is over when someone says it is, and this is where they say it.
 * The tally is the answer to "what did we decide", the blocking items and the
 * questions are the parts the author has to act on, and the button sends all
 * of it back to the pull request as the one Komodo comment there.
 *
 * It is reachable at `?j=<judgements.length>` — one past the last judgement —
 * so closing a review out survives a reload and can be linked to.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { GithubReviewPanel } from "@/components/review/github-review";
import { usePostReceipt } from "@/lib/data/mutations";
import { cn, relativeTime } from "@/lib/utils";
import { useNow } from "@/lib/data/provider";
import type {
  Answer,
  Bucket,
  Review,
  ReviewJudgement,
  VerificationEntry,
  VerificationRequirement,
} from "@/lib/types";

import { BUCKET_HEADING, BUCKET_ORDER, BUCKET_TONE } from "./labels";

export function ClosingScreen({
  review,
  judgements,
  answers,
  verificationRequirements,
  verifications,
  currentHeadSha,
  onBack,
}: {
  review: Review;
  judgements: ReviewJudgement[];
  answers: Answer[];
  verificationRequirements: VerificationRequirement[];
  verifications: VerificationEntry[];
  /** The pull request's head now, which the run's may no longer be. */
  currentHeadSha: string;
  onBack: () => void;
}) {
  const router = useRouter();
  const post = usePostReceipt();
  const now = useNow();

  const [pending, setPending] = useState(false);
  const [posted, setPosted] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const answerFor = new Map<string, Answer>(
    answers.map((a) => [a.judgementId, a]),
  );
  const decided = judgements
    .map((j) => ({ judgement: j, answer: answerFor.get(j.id) }))
    .filter((row) => row.answer?.bucket);
  const unanswered = judgements.length - decided.length;
  const currentVerification = new Map(
    verifications.map((entry) => [entry.requirementId, entry]),
  );
  const requiredChecks = verificationRequirements.filter((check) => check.required);
  const verifiedChecks = requiredChecks.filter(
    (check) => currentVerification.get(check.id)?.result === "verified",
  ).length;
  const failedChecks = requiredChecks.filter(
    (check) => currentVerification.get(check.id)?.result === "failed",
  ).length;
  const blockedChecks = requiredChecks.filter(
    (check) => currentVerification.get(check.id)?.result === "blocked",
  ).length;
  const verificationComplete =
    review.version === 3 && verifiedChecks === requiredChecks.length;

  const countFor = (bucket: Bucket) =>
    decided.filter((row) => row.answer?.bucket === bucket).length;

  // The store remembers a post, so a reload shows what happened rather than
  // offering the button a second time. Local state covers the same screen
  // before the router has caught up.
  const receiptUrl = posted ?? review.receiptUrl;

  const send = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      setPosted(await post(review.id));
      router.refresh();
    } catch (err) {
      // A missing token is the common one, and its message says what to do.
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[720px] px-6 py-10">
        <h1 className="text-[22px] leading-snug">
          {unanswered === 0
            ? `You answered all ${judgements.length}.`
            : `${decided.length} of ${judgements.length} answered.`}
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
          {unanswered === 0
            ? "Nothing here is waiting on you. Post the outcome and the pull request says so too."
            : `${unanswered} judgement${unanswered > 1 ? "s are" : " is"} still open. You can post what is decided so far and come back to the rest.`}
        </p>

        <div className="mt-8 border border-border">
          {BUCKET_ORDER.map((bucket, i) => (
            <div
              key={bucket}
              className={cn(
                "flex items-baseline gap-3 px-3 py-2 text-sm",
                i > 0 && "border-t border-border",
              )}
            >
              <span className={cn("label-mono w-40 text-[10px]", BUCKET_TONE[bucket])}>
                {BUCKET_HEADING[bucket]}
              </span>
              <span className="tabular-nums">{countFor(bucket)}</span>
            </div>
          ))}
        </div>

        <section className="mt-6 border border-border px-3 py-3 text-sm">
          <h2 className="label-mono text-[10px] text-muted-foreground">
            Result verification
          </h2>
          <p className="mt-2">
            {requiredChecks.length
              ? `${verifiedChecks} of ${requiredChecks.length} required checks verified.`
              : "No verification plan was recorded. This is not evidence that the result works."}
          </p>
          {failedChecks || blockedChecks ? (
            <p className="mt-1 text-[hsl(var(--destructive))]">
              {failedChecks} failed · {blockedChecks} blocked
            </p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">
            Approving is a separate act, taken below with your own GitHub
            account. Nothing Komodo records here grants it.
          </p>
        </section>

        {BUCKET_ORDER.map((bucket) => {
          const inBucket = decided.filter((row) => row.answer?.bucket === bucket);
          if (!inBucket.length) return null;
          return (
            <section key={bucket} className="mt-6">
              <h2 className="label-mono mb-2 text-[10px] text-muted-foreground">
                {BUCKET_HEADING[bucket]}
              </h2>
              <ul className="flex flex-col gap-1">
                {inBucket.map(({ judgement, answer }) => (
                  <li key={judgement.id} className="text-sm">
                    {judgement.title.replace(/\.$/, "")} —{" "}
                    <span className="text-muted-foreground">
                      {answer?.note ? answer.note : answer?.optionLabel}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        <div className="mt-10 border-t border-border pt-6">
          {receiptUrl ? (
            <p className="text-sm text-muted-foreground">
              Posted{" "}
              {review.receiptPostedAt
                ? relativeTime(review.receiptPostedAt, now)
                : "just now"}
              .{" "}
              <a
                href={receiptUrl}
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-foreground"
              >
                See the comment
              </a>
              {" · "}
              <button
                type="button"
                onClick={() => void send()}
                disabled={pending}
                className="underline hover:text-foreground disabled:opacity-50"
              >
                {pending ? "Posting…" : "Post it again"}
              </button>
            </p>
          ) : (
            <div className="flex items-center gap-3">
              <Button variant="brand" onClick={() => void send()} disabled={pending}>
                {pending
                  ? "Posting…"
                  : verificationComplete && unanswered === 0
                    ? "Post review record"
                    : "Post in-progress record"}
              </Button>
              <span className="text-xs text-muted-foreground">
                Replaces Komodo&rsquo;s comment on the pull request.
              </span>
            </div>
          )}

          {error ? (
            <p className="mt-3 text-sm text-[hsl(var(--destructive))]">{error}</p>
          ) : null}
        </div>

        {/* The GitHub review itself, which is a separate act from Komodo's
            record of it — see AGENTS.md rule 15. The record above is Komodo
            saying what the team decided; this is a person telling GitHub. */}
        <GithubReviewPanel
          reviewId={review.id}
          headSha={review.headSha}
          headMoved={review.headSha !== currentHeadSha}
          unverifiedRequired={requiredChecks.length - verifiedChecks}
          suggestedBody={suggestedReviewBody({
            decided,
            unanswered,
            verified: verifiedChecks,
            required: requiredChecks.length,
          })}
        />

        <button
          type="button"
          onClick={onBack}
          className="mt-8 text-xs text-muted-foreground underline hover:text-foreground"
        >
          Back to the last judgement
        </button>
      </div>
    </div>
  );
}

/**
 * A first draft of the review body, from what the team actually answered.
 *
 * A starting point and nothing more — it stays editable, because the tally is a
 * summary of decisions and not a substitute for whatever the reviewer wants to
 * say. It deliberately does not render a verdict: Komodo's answer buckets are
 * how a team organised its questions, and turning them into "looks good to me"
 * would be Komodo making the call the person is here to make.
 */
function suggestedReviewBody({
  decided,
  unanswered,
  verified,
  required,
}: {
  decided: { judgement: ReviewJudgement; answer: Answer | undefined }[];
  unanswered: number;
  verified: number;
  required: number;
}): string {
  const lines: string[] = [];

  for (const bucket of BUCKET_ORDER) {
    const inBucket = decided.filter((row) => row.answer?.bucket === bucket);
    if (!inBucket.length) continue;
    lines.push(`**${BUCKET_HEADING[bucket]}**`);
    for (const { judgement, answer } of inBucket) {
      const note = answer?.note ? ` — ${answer.note}` : "";
      lines.push(`- ${judgement.title.replace(/\.$/, "")}${note}`);
    }
    lines.push("");
  }

  if (required > 0) {
    lines.push(`${verified} of ${required} required result checks verified.`);
  }
  if (unanswered > 0) {
    lines.push(`${unanswered} question${unanswered > 1 ? "s" : ""} still open.`);
  }

  return lines.join("\n").trim();
}
