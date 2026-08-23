/**
 * One pull request's review — the screen this product exists for.
 *
 * A server component rather than a drawer over the queue, because the review
 * body does not travel in the shared snapshot: it carries every judgement the
 * reviewer wrote and, behind them, the patches. This route reads its own.
 *
 * The path names the pull request the way a person would say it, and the query
 * names the rest: `?run=<headSha>` picks an earlier immutable run, `?j=<n>` the
 * judgement on screen, `?view=whole` the full record. AGENTS.md rule 7.
 */
import { notFound } from "next/navigation";

import { ReviewHeader } from "@/components/review/header";
import { DecisionQueue } from "@/components/review/queue";
import { WholeReview } from "@/components/review/whole";
import {
  loadLatestReview,
  loadReview,
  loadReviewFiles,
  loadReviewRuns,
  loadSnapshot,
} from "@/lib/data/server";
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

  const { organization, repositories, judgments } = await loadSnapshot();
  const repoId = `${owner}/${repo}`;
  const prId = `${repoId}#${number}`;

  // Every id in the store is derived from these three, so the row is found by
  // construction rather than by search.
  const repository = repositories.find((r) => r.id === repoId);
  const judgment = judgments.find((j) => j.prId === prId);
  if (!repository || !judgment) notFound();

  const runs = await loadReviewRuns(prId);
  const run = first(query.run);
  const detail = run
    ? await loadReview(`${prId}@${run}`)
    : await loadLatestReview(prId);

  const files = detail ? await loadReviewFiles(detail.review.id) : [];
  const view = first(query.view) === "whole" ? "whole" : "queue";

  return (
    // The shell is fixed-height, so this pane owns its own scrolling and the
    // children below own theirs. AGENTS.md rule 8.
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ReviewHeader
        pr={judgment}
        repoFullName={`${repository.owner}/${repository.name}`}
        runs={runs}
        current={detail?.review ?? null}
        orgSlug={organization.slug}
        estimate={estimateTime(detail?.judgements.length ?? 0)}
      />

      {!detail ? (
        <NoRun status={judgment.status} />
      ) : view === "whole" ? (
        <WholeReview detail={detail} files={files} />
      ) : (
        <DecisionQueue
          review={detail.review}
          judgements={detail.judgements}
          answers={detail.answers}
          votes={detail.votes}
          prUrl={judgment.url}
        />
      )}
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
    skipped: "Komodo skipped this one — nothing here was reviewable.",
    error: "The last review of this head failed. It stays in the work list.",
    usage_limit: "The provider's usage limit was reached before this ran.",
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
