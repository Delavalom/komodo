/**
 * The reviewer.
 *
 * Takes whatever the store says still needs reviewing and runs it through
 * @komodo/core, one pull request at a time. The work list is computed from
 * (prId, headSha) rather than held in memory, so killing this mid-run loses
 * at most the review in flight: on restart the same pull request is simply
 * still outstanding.
 */
import { runReview, type GitHubClient, type KomodoConfig } from "@komodo/core";
import type { ReviewProvider } from "@komodo/core";
import type { KomodoStore, PullRequest, Repository } from "@komodo/store";

import { toFailedJudgment, toFindings, toJudgment } from "./map.js";

export interface ReviewRunnerOptions {
  store: KomodoStore;
  github: GitHubClient;
  provider: ReviewProvider;
  config: KomodoConfig;
  /** Post the review back to GitHub. Off by default: the queue is the point. */
  post?: boolean;
  onProgress?: (msg: string) => void;
}

export interface ReviewPassResult {
  reviewed: number;
  failed: number;
}

/** Reviews everything currently outstanding. Returns once the list is empty. */
export async function reviewPending(
  options: ReviewRunnerOptions,
): Promise<ReviewPassResult> {
  const { store, onProgress } = options;
  const pending = await store.listPullRequestsNeedingReview();
  const { repositories } = await store.snapshot();
  const repoIndex = new Map(repositories.map((r) => [r.id, r]));

  let reviewed = 0;
  let failed = 0;

  for (const pr of pending) {
    const repo = repoIndex.get(pr.repoId);
    if (!repo) continue;
    const ok = await reviewOne(options, pr, repo);
    if (ok) reviewed++;
    else failed++;
  }

  onProgress?.(`Reviewed ${reviewed}, failed ${failed}.`);
  return { reviewed, failed };
}

async function reviewOne(
  options: ReviewRunnerOptions,
  pr: PullRequest,
  repo: Repository,
): Promise<boolean> {
  const { store, github, provider, config, onProgress } = options;
  const ref = { owner: repo.owner, repo: repo.name, number: pr.number };

  onProgress?.(`Reviewing ${repo.owner}/${repo.name}#${pr.number}…`);
  try {
    const outcome = await runReview({
      ref,
      provider,
      config,
      github,
      post: options.post ?? false,
      onProgress,
    });

    const result = outcome.record.result;
    const judgmentId = await store.upsertJudgment(
      toJudgment(pr.id, pr.headSha, result),
    );
    await store.replaceFindings(judgmentId, toFindings(result));
    return true;
  } catch (err) {
    // A failed review is recorded rather than swallowed: the row shows why it
    // has no verdict, and the pull request stays in the work list so the next
    // pass retries it.
    const message = err instanceof Error ? err.message : String(err);
    onProgress?.(`  failed: ${message}`);
    await store.upsertJudgment(
      toFailedJudgment(pr.id, pr.headSha, classify(message)),
    );
    return false;
  }
}

function classify(message: string): "error" | "skipped" | "usage_limit" {
  if (/usage limit|rate limit|quota|429/i.test(message)) return "usage_limit";
  if (/no reviewable files/i.test(message)) return "skipped";
  return "error";
}
