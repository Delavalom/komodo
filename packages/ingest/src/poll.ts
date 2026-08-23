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
import type { KomodoStore, PullRequest } from "@komodo/store";

export interface PollResult {
  seen: number;
  changed: number;
  closed: number;
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
  const { repositories, teams } = await store.snapshot();
  const watched = new Set(teams.flatMap((t) => t.watchedRepoIds));
  const targets = repositories.filter(
    (r) => r.enabled && (watched.size === 0 || watched.has(r.id)),
  );

  const known = new Map(
    (await store.listPullRequests()).map((p) => [p.id, p]),
  );

  let seen = 0;
  let changed = 0;
  const stillOpen = new Set<string>();

  for (const repo of targets) {
    options.onProgress?.(`Polling ${repo.owner}/${repo.name}…`);
    const listed = await github.listOpenPRs(repo.owner, repo.name);

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
  const closed = await closeVanished(store, known, targets, stillOpen);

  return { seen, changed, closed };
}

async function closeVanished(
  store: KomodoStore,
  known: Map<string, PullRequest>,
  targets: { id: string }[],
  stillOpen: Set<string>,
): Promise<number> {
  const watchedRepos = new Set(targets.map((r) => r.id));
  let closed = 0;

  for (const pr of known.values()) {
    if (pr.state !== "open") continue;
    if (!watchedRepos.has(pr.repoId)) continue;
    if (stillOpen.has(pr.id)) continue;

    // The listing cannot say which of merged or closed it was, and guessing
    // would put a wrong badge on the row. "closed" is the honest floor; the
    // next full sync of that PR corrects it.
    await store.upsertPullRequest({ ...pr, state: "closed" });
    closed++;
  }
  return closed;
}
