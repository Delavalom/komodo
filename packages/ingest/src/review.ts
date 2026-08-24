/**
 * The reviewer.
 *
 * Takes whatever the store says still needs reviewing and runs it through
 * @komodo/core, one pull request at a time. The work list is computed from
 * (prId, headSha) rather than held in memory, so killing this mid-run loses
 * at most the review in flight: on restart the same pull request is simply
 * still outstanding.
 */
import {
  runReview,
  WALKTHROUGH_MARKER,
  type GitHubClient,
  type KomodoConfig,
} from "@komodo/core";
import type { ReviewProvider } from "@komodo/core";
import type { KomodoStore, PullRequest, Repository } from "@komodo/store";

import type { RepoCheckout } from "./checkout.js";
import { selectMemories, type SelectedMemories } from "./memory.js";
import { fetchIssueContext, findIssueKeys } from "./tracker.js";
import {
  toFailedJudgment,
  toFindings,
  toJudgment,
  toReview,
  toSkippedJudgment,
} from "./map.js";

export interface ReviewRunnerOptions {
  store: KomodoStore;
  github: GitHubClient;
  provider: ReviewProvider;
  config: KomodoConfig;
  /** Post the review back to GitHub. Off by default: the queue is the point. */
  post?: boolean;
  /**
   * Supplies a working tree at the pull request's head. Omitted, reviews see
   * the diff and nothing else — which is a materially shallower review, so
   * `komodo serve` passes one by default.
   */
  checkout?: RepoCheckout;
  /** Stable for one worker process; used to own durable leases. */
  workerId?: string;
  onProgress?: (msg: string) => void;
}

export interface ReviewPassResult {
  reviewed: number;
  failed: number;
  /** Passed over by `shouldReview` rather than attempted. */
  skipped: number;
}

/**
 * Why a pull request was passed over, or null if it should be reviewed.
 *
 * These rules used to be split between a WHERE clause (drafts) and nowhere at
 * all (everything else in `auto_review`, which the config parsed and no code
 * read). Both problems are the same problem: a decision about *what is worth
 * a review* is a setting, and a setting has to live somewhere a setting can
 * reach.
 *
 * The reason is returned rather than a boolean so the queue can say what
 * happened. A pull request nobody reviewed and nobody explained is
 * indistinguishable, to the person waiting on it, from one Komodo lost.
 */
export function shouldReview(
  pr: PullRequest,
  config: KomodoConfig,
): { skip: false } | { skip: true; reason: string } {
  const { auto_review } = config;

  if (pr.isDraft && !auto_review.drafts) {
    return { skip: true, reason: "draft" };
  }

  const title = pr.title.toLowerCase();
  const keyword = auto_review.ignore_title_keywords.find(
    (word) => word.trim() && title.includes(word.toLowerCase()),
  );
  if (keyword) {
    return { skip: true, reason: `title contains "${keyword}"` };
  }

  const { mode, tokens } = auto_review.authors;
  if (tokens.length) {
    // Case-insensitive: GitHub logins are, and a roster typed by hand will
    // not match one that was copied out of the API.
    const listed = tokens.some(
      (t) => t.toLowerCase() === pr.author.toLowerCase(),
    );
    if (mode === "exclude" && listed) {
      return { skip: true, reason: `author ${pr.author} is filtered out` };
    }
    if (mode === "include" && !listed) {
      return { skip: true, reason: `author ${pr.author} is not on the review list` };
    }
  }

  // 0 disables the cap. A pull request that rewrites a lockfile or vendors a
  // dependency is not a review a subscription should pay for.
  if (auto_review.max_files > 0 && pr.changedFiles > auto_review.max_files) {
    return {
      skip: true,
      reason: `${pr.changedFiles} files changed, over the ${auto_review.max_files} limit`,
    };
  }

  return { skip: false };
}

/** Claims and reviews explicitly requested jobs. Returns once the queue is empty. */
export async function reviewPending(
  options: ReviewRunnerOptions,
): Promise<ReviewPassResult> {
  const { store, onProgress } = options;
  const { repositories } = await store.snapshot();
  const repoIndex = new Map(repositories.map((r) => [r.id, r]));
  const workerId = options.workerId ?? `local-${process.pid}`;
  const pausedUntil = Number(await store.getMeta("review.providerPausedUntil"));
  if (Number.isFinite(pausedUntil) && pausedUntil > Date.now()) {
    onProgress?.(
      `Review provider paused until ${new Date(pausedUntil).toISOString()}; inventory polling continues.`,
    );
    return { reviewed: 0, failed: 0, skipped: 0 };
  }

  let reviewed = 0;
  let failed = 0;
  let skipped = 0;

  while (true) {
    const claim = await store.claimNextAIReview({
      workerId,
      now: Date.now(),
      leaseMs: 15 * 60_000,
    });
    if (!claim) break;
    const { job, pr } = claim;
    const repo = repoIndex.get(pr.repoId);
    if (!repo || pr.headSha !== job.headSha || pr.state !== "open") {
      await store.finishAIReviewJob({
        jobId: job.id,
        workerId,
        state: "cancelled",
        finishedAt: Date.now(),
        error: "Pull request head or state changed before the review started.",
      });
      continue;
    }

    const verdict = shouldReview(pr, options.config);
    if (verdict.skip) {
      // Recorded, not dropped: the row explains itself in the queue, and the
      // work list treats a skipped head as settled so this costs one write
      // rather than one per pass forever.
      onProgress?.(
        `Skipping ${repo.owner}/${repo.name}#${pr.number} — ${verdict.reason}.`,
      );
      await store.upsertJudgment(toSkippedJudgment(pr.id, pr.headSha));
      await postStatusComment(options, repo, pr, `Skipped — ${verdict.reason}.`);
      await store.finishAIReviewJob({
        jobId: job.id,
        workerId,
        state: "skipped",
        finishedAt: Date.now(),
        error: verdict.reason,
      });
      skipped++;
      continue;
    }

    const outcome = await reviewOne(options, pr, repo);
    await store.finishAIReviewJob({
      jobId: job.id,
      workerId,
      state: outcome.ok ? "completed" : "failed",
      finishedAt: Date.now(),
      error: outcome.ok ? null : outcome.error,
    });
    if (outcome.ok) reviewed++;
    else {
      failed++;
      // A managed launcher being terminated is provider-level, not evidence
      // that the next PR is bad. Persist the pause so this pass, the next
      // minute, and a process restart cannot walk the whole backlog.
      await store.setMeta(
        "review.providerPausedUntil",
        String(Date.now() + 15 * 60_000),
      );
      break;
    }
  }

  onProgress?.(
    `Reviewed ${reviewed}, failed ${failed}` +
      (skipped ? `, skipped ${skipped}` : "") +
      ".",
  );
  return { reviewed, failed, skipped };
}

async function reviewOne(
  options: ReviewRunnerOptions,
  pr: PullRequest,
  repo: Repository,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { store, github, provider, config, onProgress } = options;
  const ref = { owner: repo.owner, repo: repo.name, number: pr.number };

  onProgress?.(`Reviewing ${repo.owner}/${repo.name}#${pr.number}…`);
  try {
    // Best effort: a repository that cannot be fetched still gets reviewed,
    // just from the patch alone.
    const repoDir = await options.checkout?.prepare({
      owner: repo.owner,
      name: repo.name,
      number: pr.number,
    });

    // What this team has taught Komodo, narrowed to the rules whose scope
    // matches this pull request. Selected before the run because the reviewer
    // needs them in its prompt, and recorded after it because the usage
    // ledger keys on the run's id.
    const context = await gatherMemories(options, repo, pr, repoDir);

    const outcome = await runReview({
      ref,
      provider,
      config,
      github,
      repoDir,
      memories: context.memories,
      post: options.post ?? false,
      onProgress,
    });

    const result = outcome.record.result;
    const judgmentId = await store.upsertJudgment(
      toJudgment(pr.id, pr.headSha, result),
    );
    // The body itself, including the judgements GitHub would not take. The
    // queue row above summarises this; this is the review.
    const reviewId = await store.saveReview(
      toReview(pr.id, outcome.record, outcome.droppedJudgements),
    );
    await store.recordMemoryUse(reviewId, context.uses);
    // After the review, not before: each finding names the judgement it
    // summarises, and those ids only exist once the run has been written.
    await store.replaceFindings(
      judgmentId,
      toFindings(result, reviewId, outcome.droppedJudgements),
    );
    return { ok: true };
  } catch (err) {
    // A failed review is recorded rather than swallowed. The durable job is
    // settled as failed by the caller and requires an explicit retry; blindly
    // moving to the next PR is how one broken provider spends a whole queue.
    const message = err instanceof Error ? err.message : String(err);
    onProgress?.(`  failed: ${message}`);
    await store.upsertJudgment(
      toFailedJudgment(pr.id, pr.headSha, classify(message)),
    );
    await postStatusComment(
      options,
      repo,
      pr,
      `The review did not finish — ${firstLine(message)}. Open Komodo to retry it.`,
    );
    return { ok: false, error: message };
  }
}

/**
 * The extra context this pull request gets: the team's own rules, plus the
 * issue it names.
 *
 * Reads the changed paths off GitHub rather than off the diff the reviewer is
 * about to fetch: the file-glob scope has to be decided before the run, and
 * the listing is a request the poller has already paid for the value of.
 *
 * Best effort throughout. Custom context makes a review better; failing to
 * load it must not stop the review happening at all.
 */
async function gatherMemories(
  options: ReviewRunnerOptions,
  repo: Repository,
  pr: PullRequest,
  repoDir: string | undefined,
): Promise<SelectedMemories> {
  const empty: SelectedMemories = { memories: [], uses: [] };
  const settings = await options.store.loadSettings().catch(() => null);
  if (settings && !settings.memoryEnabled) return empty;

  try {
    const [rules, clusters, files] = await Promise.all([
      options.store.listMemoryRules(),
      options.store.listRepoClusters(),
      options.github.listFiles({
        owner: repo.owner,
        repo: repo.name,
        number: pr.number,
      }),
    ]);
    if (!rules.length) return empty;

    const selected = selectMemories({
      rules,
      clusters,
      repoId: repo.id,
      changedPaths: files.map((f) => f.path),
      repoDir,
      onProgress: options.onProgress,
    });

    // The ticket, when the pull request names one. A review's hardest question
    // is usually "is this the right change", and the answer lives there rather
    // than in the diff.
    const issues = await fetchIssueContext({
      store: options.store,
      keys: findIssueKeys(pr.title),
      onProgress: options.onProgress,
    });

    const memories = [...selected.memories, ...issues];
    if (memories.length) {
      options.onProgress?.(
        `  applying ${memories.length} piece(s) of extra context.`,
      );
    }
    return { memories, uses: selected.uses };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    options.onProgress?.(`  could not load custom context: ${detail}`);
    return empty;
  }
}

/**
 * Tells the pull request that a review did not happen, and why.
 *
 * Uses the same marker as the receipt, so this replaces Komodo's one comment
 * rather than adding a second — and the next successful review replaces it
 * back. A pull request never accumulates a history of Komodo talking about
 * itself.
 *
 * Best effort: nothing here is worth failing a pass over, and the queue
 * already carries the same fact in a place that does not depend on GitHub.
 */
async function postStatusComment(
  options: ReviewRunnerOptions,
  repo: Repository,
  pr: PullRequest,
  body: string,
): Promise<void> {
  if (!options.post || !options.config.post.status_comments) return;
  if (options.config.post.mode === "none") return;

  try {
    await options.github.upsertWalkthroughComment(
      { owner: repo.owner, repo: repo.name, number: pr.number },
      WALKTHROUGH_MARKER,
      `${WALKTHROUGH_MARKER}\n\n### 🦎 Komodo\n\n${body}`,
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    options.onProgress?.(`  could not post the status comment: ${detail}`);
  }
}

function firstLine(text: string): string {
  const line = text.split("\n").find((l) => l.trim().length > 0) ?? text;
  return line.length > 160 ? `${line.slice(0, 157)}…` : line;
}

function classify(message: string): "error" | "skipped" | "usage_limit" {
  if (/usage limit|rate limit|quota|429/i.test(message)) return "usage_limit";
  if (/no reviewable files/i.test(message)) return "skipped";
  return "error";
}
