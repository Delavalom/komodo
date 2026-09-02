/**
 * One pull request's review — the screen this product exists for.
 *
 * A server component rather than a drawer over the queue, because the review
 * body does not travel in the shared snapshot: it carries every judgement the
 * reviewer wrote and, behind them, the patches. This route reads its own.
 *
 * The path names the pull request the way a person would say it, and the query
 * names the rest: `?run=<headSha>` picks an earlier immutable run, `?j=<n>` the
 * judgement on screen, and `?view=decisions|whole` switches away from result
 * verification. AGENTS.md rule 8.
 */
import { Suspense } from "react";
import { notFound } from "next/navigation";

import { ReviewHeader } from "@/components/review/header";
import { ConversationView } from "@/components/review/conversation";
import { DecisionQueue } from "@/components/review/queue";
import { WholeReview } from "@/components/review/whole";
import { VerificationReview } from "@/components/review/verification";
import {
  loadReview,
  loadReviewFiles,
  loadReviewRuns,
  loadSnapshot,
  requestNow,
} from "@/lib/data/server";
import { loadConversation } from "@/lib/data/conversation";
import { estimateTime } from "@komodo/core/store";

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; owner: string; repo: string; number: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // `org` is in the path for readability, but the slug the header links with
  // comes off the snapshot — there is one organization per deployment and the
  // store, not the URL, is what names it.
  const { owner, repo, number } = await params;
  const query = await searchParams;

  const { organization, repositories, pullRequests, judgments } = await loadSnapshot();
  const repoId = `${owner}/${repo}`;
  const prId = `${repoId}#${number}`;

  // Every id in the store is derived from these three, so the row is found by
  // construction rather than by search.
  const repository = repositories.find((r) => r.id === repoId);
  const pr = pullRequests.find((candidate) => candidate.id === prId);
  const judgment = judgments.find(
    (candidate) => candidate.prId === prId && candidate.headSha === pr?.headSha,
  );
  if (!repository || !pr) notFound();

  const runs = await loadReviewRuns(prId);
  const run = first(query.run);
  const detail = run
    ? await loadReview(`${prId}@${run}`)
    : await loadReview(`${prId}@${pr.headSha}`);

  const files = detail ? await loadReviewFiles(detail.review.id) : [];
  const requestedView = first(query.view);
  const view =
    requestedView === "whole"
      ? "whole"
      : requestedView === "decisions"
        ? "decisions"
        : requestedView === "conversation"
          ? "conversation"
          : "verify";

  // Read through the cache, and only for the view that shows it: a
  // conversation costs three GitHub requests, and the other three views have
  // no use for one. See lib/data/conversation.ts for why this is not polled.

  return (
    // The shell is fixed-height, so this pane owns its own scrolling and the
    // children below own theirs. AGENTS.md rule 9.
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ReviewHeader
        pr={pr}
        repoFullName={`${repository.owner}/${repository.name}`}
        runs={runs}
        current={detail?.review ?? null}
        orgSlug={organization.slug}
        estimate={estimateTime(detail?.judgements.length ?? 0)}
      />

      {view === "conversation" ? (
        // Streamed, because this is the one view that waits on GitHub. Without
        // a boundary a slow or hanging API leaves the reader looking at the
        // previous screen with no indication that anything is happening.
        <Suspense fallback={<LoadingConversation />}>
          <Conversation prId={prId} prUrl={pr.url} />
        </Suspense>
      ) : !detail ? (
        <NoRun status={judgment?.status ?? "not_requested"} />
      ) : view === "whole" ? (
        <WholeReview detail={detail} files={files} />
      ) : view === "verify" ? (
        <VerificationReview
          requirements={detail.verificationRequirements}
          verifications={detail.verifications}
        />
      ) : (
        <DecisionQueue
          review={detail.review}
          judgements={detail.judgements}
          answers={detail.answers}
          votes={detail.votes}
          currentHeadSha={pr.headSha}
          verificationRequirements={detail.verificationRequirements}
          verifications={detail.verifications}
        />
      )}
    </div>
  );
}

/** The conversation, once GitHub has answered. */
async function Conversation({ prId, prUrl }: { prId: string; prUrl: string }) {
  // The clock is read once per request and carried down — AGENTS.md rule 6.
  // Staleness is an age, and an age computed from a second reading of the
  // clock is one the rest of the page does not agree with.
  const view = await loadConversation(prId, { now: requestNow() });
  return (
    <ConversationView
      prId={prId}
      prUrl={prUrl}
      comments={view.conversation?.comments ?? []}
      observedAt={view.conversation?.observedAt ?? null}
      error={view.error}
    />
  );
}

function LoadingConversation() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <p className="mx-auto max-w-[760px] px-6 py-10 text-sm text-muted-foreground">
        Reading the conversation from GitHub…
      </p>
    </div>
  );
}

/**
 * A queue row can exist before any review body does — the poller writes the
 * pull request, and the reviewer follows minutes later, or fails. Saying which
 * beats an empty screen.
 */
function NoRun({ status }: { status: string }) {
  const reason: Record<string, string> = {
    pending: "Komodo has not reviewed this head yet.",
    not_requested: "This pull request is in the team inventory. No AI review has been requested yet.",
    skipped: "Komodo skipped this one — nothing here was reviewable.",
    error: "The last review of this head failed. Retry it from the queue when the provider is ready.",
    usage_limit: "The provider's usage limit was reached. Retry it from the queue after the limit resets.",
    trial_ended: "The trial ended before this was reviewed.",
    completed:
      "This was reviewed before Komodo kept review bodies. Re-run it to see the judgements.",
  };
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <p className="mx-auto max-w-[720px] px-6 py-10 text-sm text-muted-foreground">
        {reason[status] ?? "No review body was recorded for this head."}
      </p>
    </div>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
