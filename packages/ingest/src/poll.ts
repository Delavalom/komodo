/**
 * The poller.
 *
 * Reads open pull requests off GitHub and writes them into the store as git
 * facts — nothing here is ever Komodo's opinion. Polling rather than webhooks
 * is deliberate: it needs no GitHub App, no public URL and no secret rotation,
 * which is what lets `komodo dev` and a self-hosted `komodo serve` behave
 * identically. The cost is minutes of lag, which a review queue can afford.
 */
import type { GitHubClient } from "@komodo/core";
import type { KomodoStore, PullRequest, Repository } from "@komodo/store";

export interface PollResult {
  seen: number;
  changed: number;
  closed: number;
  /** Repositories whose listing failed this pass, and so were left as they were. */
  unreachable: number;
}

/**
 * One pass over every watched repository.
 *
 * The detail and reviews calls only fire for a pull request that is new or
 * whose head moved. Everything else costs one listing per repo, so the poll
 * stays cheap enough to run on a short interval against a real team's repos.
 */
export async function pollRepositories(
  github: GitHubClient,
  store: KomodoStore,
  options: { onProgress?: (msg: string) => void } = {},
): Promise<PollResult> {
  // `enabled` is the whole switch, and deliberately the only one. It used to
  // be `enabled` intersected with what some team watched, which was invisible
  // from the screen that owns the toggle: discovery now writes repositories no
  // team watches yet, and a row switched on in Manage Repositories that the
  // poller silently ignored is exactly the class of lie the settings seam
  // exists to prevent. komodo.yaml still decides what starts enabled — see
  // config-sync.ts — it just no longer gets a second, hidden say.
  const { repositories } = await store.snapshot();
  const targets = repositories.filter((r) => r.enabled);

  const known = new Map(
    (await store.listPullRequests()).map((p) => [p.id, p]),
  );

  let seen = 0;
  let changed = 0;
  let unreachable = 0;
  const stillOpen = new Set<string>();

  for (const repo of targets) {
    options.onProgress?.(`Polling ${repo.owner}/${repo.name}…`);

    // One repository the token cannot read — renamed, gone private, a scope
    // dropped, or a demo row nobody meant to poll — used to throw out of the
    // whole pass. Every other repository then went unpolled for as long as
    // that one stayed broken, and the queue simply stopped moving with the
    // reason buried in a log line.
    let listed;
    try {
      listed = await github.listOpenPRs(repo.owner, repo.name);
    } catch (err) {
      unreachable++;
      const detail = err instanceof Error ? err.message : String(err);
      options.onProgress?.(
        `  could not list ${repo.owner}/${repo.name}: ${detail}`,
      );
      // Deliberately not marking its pull requests closed: they were not
      // observed to have left the listing, and a token that lost a scope for
      // an hour must not empty a repository's queue.
      for (const pr of known.values()) {
        if (pr.repoId === repo.id) stillOpen.add(pr.id);
      }
      continue;
    }

    for (const item of listed) {
      seen++;
      const id = `${repo.id}#${item.number}`;
      stillOpen.add(id);
      const previous = known.get(id);

      // Size and review state cost a request each. Only a new pull request or
      // a new head is worth paying for.
      const moved = !previous || previous.headSha !== item.headSha;
      if (!moved) continue;
      changed++;

      const ref = { owner: repo.owner, repo: repo.name, number: item.number };
      const [size, decisions] = await Promise.all([
        github.getPRSize(ref),
        github.listReviewDecisions(ref),
      ]);

      await store.upsertPullRequest({
        id,
        repoId: repo.id,
        number: item.number,
        title: item.title,
        author: item.author,
        url: item.url,
        headSha: item.headSha,
        state: "open",
        isDraft: item.isDraft,
        requestedReviewers: item.requestedReviewers,
        approvals: decisions.approvals,
        changesRequested: decisions.changesRequested,
        additions: size.additions,
        deletions: size.deletions,
        changedFiles: size.changedFiles,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        mergedAt: null,
      });
    }
  }

  // Anything the store still calls open that the listing no longer returned
  // has been merged or closed. Marking it keeps the queue from showing work
  // that no longer exists.
  const closed = await closeVanished(
    store,
    github,
    known,
    targets,
    stillOpen,
    options.onProgress,
  );

  return { seen, changed, closed, unreachable };
}

/**
 * Settles the pull requests that left the open listing.
 *
 * They were merged or abandoned, and the listing cannot say which. This used
 * to write "closed" for both — the honest floor, but it meant `mergedAt` was
 * never once written by real code, so every merge-time chart, the merged
 * filter and the leaderboards' merge column were permanently empty against
 * real data and only looked alive because the seeder filled them in.
 *
 * One request each, once. The row moves out of `open`, so it never enters
 * this branch again.
 */
async function closeVanished(
  store: KomodoStore,
  github: GitHubClient,
  known: Map<string, PullRequest>,
  targets: Repository[],
  stillOpen: Set<string>,
  onProgress?: (msg: string) => void,
): Promise<number> {
  const repoById = new Map(targets.map((r) => [r.id, r]));
  let closed = 0;

  for (const pr of known.values()) {
    if (pr.state !== "open") continue;
    if (stillOpen.has(pr.id)) continue;
    const repo = repoById.get(pr.repoId);
    if (!repo) continue;

    let state: PullRequest["state"] = "closed";
    let mergedAt: number | null = null;
    try {
      const ended = await github.getPRState({
        owner: repo.owner,
        repo: repo.name,
        number: pr.number,
      });
      state = ended.state;
      mergedAt = ended.mergedAt;
    } catch (err) {
      // A pull request that has become unreadable — the repository went
      // private, the token lost a scope — must not stall the pass. "closed"
      // is the same floor as before, and the row stops showing as open work.
      const detail = err instanceof Error ? err.message : String(err);
      onProgress?.(
        `  could not read the final state of ${repo.owner}/${repo.name}#${pr.number}: ${detail}`,
      );
    }

    // A pull request can be reopened, in which case the listing simply
    // returns it again next pass and it never reaches here.
    await store.upsertPullRequest({ ...pr, state, mergedAt });
    closed++;
  }
  return closed;
}
