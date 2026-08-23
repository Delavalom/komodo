/**
 * Putting a finished review into the store.
 *
 * The ingester already does this inline, because it reviewed a pull request
 * the store told it about. `komodo-review pr` has the opposite problem: it can
 * review any pull request on GitHub, including one this deployment has never
 * polled, and the row has to exist before the review can hang off it.
 *
 * So this writes the whole chain — repository, pull request, judgment,
 * findings, review body — from a `RunReviewOutcome` and nothing else. A review
 * run from a laptop then shows up in the same queue as one from the poller,
 * which is the point: there is one place the team's reviews live.
 */
import type { GitHubClient, RunReviewOutcome } from "@komodo/core";
import type { KomodoStore } from "@komodo/store";

import { toFindings, toJudgment, toReview } from "./map.js";

export interface RecordReviewResult {
  prId: string;
  judgmentId: string;
  reviewId: string;
}

export async function recordReview(args: {
  store: KomodoStore;
  github: GitHubClient;
  outcome: RunReviewOutcome;
}): Promise<RecordReviewResult> {
  const { store, github, outcome } = args;
  const { pr } = outcome.record;
  const ref = { owner: pr.owner, repo: pr.repo, number: pr.number };

  // `enabled` decides what the poller watches, and Manage Repositories owns
  // it. A repository this deployment already knows keeps whatever the screen
  // last said; one it has never seen arrives enabled, because reviewing a
  // pull request by hand is a clear enough statement of interest.
  const id = `${pr.owner}/${pr.repo}`;
  const existing = (await store.snapshot()).repositories.find((r) => r.id === id);

  const repoId = await store.upsertRepository({
    id,
    owner: pr.owner,
    name: pr.repo,
    provider: "github",
    enabled: existing?.enabled ?? true,
    reviewCount: 0,
  });

  // The same two calls the poller makes for a pull request whose head moved.
  // Without them the queue would show a review against a row claiming zero
  // changed lines and nobody's approval.
  const [size, decisions, listed] = await Promise.all([
    github.getPRSize(ref),
    github.listReviewDecisions(ref),
    github.listOpenPRs(pr.owner, pr.repo),
  ]);
  const open = listed.find((item) => item.number === pr.number);
  const now = Date.now();

  const prId = await store.upsertPullRequest({
    id: `${repoId}#${pr.number}`,
    repoId,
    number: pr.number,
    title: pr.title,
    author: pr.author,
    url: pr.url,
    headSha: pr.headSha,
    // Absent from the open listing means merged or closed. Which of the two
    // cannot be told from here, and "closed" is the honest floor — the same
    // call poll.ts makes.
    state: open ? "open" : "closed",
    isDraft: open?.isDraft ?? false,
    requestedReviewers: open?.requestedReviewers ?? [],
    approvals: decisions.approvals,
    changesRequested: decisions.changesRequested,
    additions: size.additions,
    deletions: size.deletions,
    changedFiles: size.changedFiles,
    createdAt: open?.createdAt ?? now,
    updatedAt: open?.updatedAt ?? now,
    mergedAt: null,
  });

  const result = outcome.record.result;
  const judgmentId = await store.upsertJudgment(
    toJudgment(prId, pr.headSha, result),
  );
  const reviewId = await store.saveReview(
    toReview(prId, outcome.record, outcome.droppedJudgements),
  );
  // After the review, not before: each finding names the judgement it
  // summarises, and those ids only exist once the run has been written.
  await store.replaceFindings(
    judgmentId,
    toFindings(result, reviewId, outcome.droppedJudgements),
  );

  return { prId, judgmentId, reviewId };
}
