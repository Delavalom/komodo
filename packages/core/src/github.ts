import { execFileSync } from "node:child_process";
import type { Judgement } from "./schema.js";

export interface PRRef {
  owner: string;
  repo: string;
  number: number;
}

export interface PRMeta extends PRRef {
  title: string;
  body: string;
  author: string;
  url: string;
  baseRef: string;
  headRef: string;
  headSha: string;
  isDraft: boolean;
  labels: string[];
}

/**
 * One row of a repository's open-PR listing.
 *
 * Deliberately only what `GET /pulls` returns for free: the poller runs on
 * every repo on an interval, and a per-PR detail call would turn one request
 * into a hundred. Size and review state are fetched separately, only for the
 * pull requests that actually moved.
 */
export interface PRListItem {
  number: number;
  title: string;
  author: string;
  url: string;
  headSha: string;
  isDraft: boolean;
  requestedReviewers: string[];
  createdAt: number;
  updatedAt: number;
}

/**
 * One repository as the discovery listing returns it.
 *
 * `archived` is carried because an archived repository takes no more pull
 * requests, and offering one in Manage Repositories is offering a switch that
 * can never do anything.
 */
export interface RepoListItem {
  owner: string;
  name: string;
  archived: boolean;
  isPrivate: boolean;
}

/** Who a token belongs to — what the Code Providers screen names. */
export interface GithubIdentity {
  login: string;
  name: string | null;
}

/** How a pull request ended, once it is no longer open. */
export interface PRState {
  state: "open" | "merged" | "closed";
  /** Epoch milliseconds, or null when it was closed unmerged or is still open. */
  mergedAt: number | null;
}

export interface PRSize {
  additions: number;
  deletions: number;
  changedFiles: number;
}

/** Who has signed off and who has asked for changes, latest review per person. */
export interface ReviewDecisions {
  approvals: string[];
  changesRequested: string[];
}

export interface PRFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

/** An inline review comment as GitHub returns it. */
export interface ReviewComment {
  id: number;
  /** Set when this comment is a reply to another inline comment. */
  in_reply_to_id?: number;
  path: string;
  line: number | null;
  body: string;
  html_url: string;
  created_at: string;
  user: { login: string } | null;
}

export interface InlineComment {
  path: string;
  line: number;
  start_line?: number;
  side: "RIGHT";
  start_side?: "RIGHT";
  body: string;
}

/** A comment on the pull request itself, rather than on a line of the diff. */
export interface IssueComment {
  id: number;
  author: string;
  body: string;
  html_url: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * A submitted review, with the body `listReviewDecisions` throws away.
 *
 * That method answers "who has signed off"; this one answers "what did they
 * say", which is what a reader in Komodo actually wants to see.
 */
export interface SubmittedReview {
  id: number;
  author: string;
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED" | "PENDING";
  body: string;
  html_url: string;
  /** Null while a review is still a pending draft. */
  submittedAt: number | null;
}

/**
 * What a commit's checks add up to.
 *
 * `neutral` is not "fine" — it is "this commit has no checks", which is a
 * different thing from every check passing and must not be shown as green.
 */
export type ChecksState = "passing" | "failing" | "pending" | "neutral";

/**
 * One pull request's check rollup: the state, and nothing that costs extra.
 *
 * `failing` starts empty and is filled in by `failingChecks` for the pull
 * requests this says are red — see CHECK_ROLLUP_QUERY for why the names are
 * not part of the same request.
 */
export interface CheckRollup {
  number: number;
  /** The commit the rollup describes. A rollup outlives the head it read. */
  headSha: string;
  state: ChecksState;
  /** Names of the failing checks, once somebody has paid to look them up. */
  failing: string[];
}

/** A commit's checks counted one by one — the expensive answer. */
export interface CheckDetail {
  state: ChecksState;
  total: number;
  passed: number;
  failed: number;
  pending: number;
  failing: string[];
}

/**
 * The three things a human review can be.
 *
 * Deliberately not accepted by `postReview`: that method is what the automated
 * pipeline calls and it hardcodes COMMENT, so no amount of caller confusion
 * can make Komodo's reviewer approve a pull request. This vocabulary exists
 * only for `submitHumanReview`, which a person drives with their own token.
 */
export type HumanReviewEvent = "COMMENT" | "REQUEST_CHANGES" | "APPROVE";

const API = "https://api.github.com";

export function resolveGithubToken(): string {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  try {
    return execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
  } catch {
    throw new Error(
      "No GitHub credentials found. Run `gh auth login`, or set GITHUB_TOKEN to a fine-grained PAT with Pull requests: write + Contents: read.",
    );
  }
}

/** Parse "owner/repo#123", a full PR URL, or a bare number (with repo inferred from `origin`). */
export function parsePRRef(input: string, cwd = process.cwd()): PRRef {
  const url = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(input);
  if (url) return { owner: url[1], repo: url[2], number: parseInt(url[3], 10) };
  const shorthand = /^([^/\s]+)\/([^#\s]+)#(\d+)$/.exec(input);
  if (shorthand) return { owner: shorthand[1], repo: shorthand[2], number: parseInt(shorthand[3], 10) };
  if (/^\d+$/.test(input)) {
    const remote = execFileSync("git", ["remote", "get-url", "origin"], { cwd, encoding: "utf8" }).trim();
    const m = /github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?$/.exec(remote);
    if (!m) throw new Error(`Cannot infer GitHub repo from origin remote: ${remote}`);
    return { owner: m[1], repo: m[2], number: parseInt(input, 10) };
  }
  throw new Error(`Unrecognized PR reference: "${input}". Use a URL, owner/repo#123, or a number inside a repo.`);
}

/** Attempts per request, including the first. */
const MAX_ATTEMPTS = 4;

/**
 * How long one HTTP call may take before it is abandoned.
 *
 * Undici's default header timeout is five minutes, and four attempts of that is
 * twenty minutes for a single request — which is fine for a poller nobody is
 * watching and intolerable for a page render, where it means a reader clicks a
 * tab and the previous screen simply stays there. Ten seconds is longer than
 * any healthy GitHub call and short enough that a hung socket is an error
 * rather than a hang.
 */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * The longest this will sit on a rate limit before giving up on the request.
 *
 * A primary rate limit can reset up to an hour out, and sleeping through that
 * would stall the ingest loop on one repository while every other repository
 * waits behind it. Past this the request throws, the pass logs and ends, and
 * the next pass — a minute or five later — tries again. A poller can afford
 * to be told "not now"; it cannot afford to block.
 */
const MAX_BACKOFF_MS = 60_000;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * How long to wait before retrying, or null if this response is not worth
 * retrying at all.
 *
 * GitHub signals three different things with overlapping status codes:
 * `Retry-After` on a secondary limit, an exhausted `x-ratelimit-remaining`
 * with a reset timestamp on a primary one, and plain 5xx on its own trouble.
 * All three are transient and none of them mean the caller did anything wrong.
 */
function retryDelay(res: Response, attempt: number): number | null {
  const retryAfter = res.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1000;
  }

  const remaining = res.headers.get("x-ratelimit-remaining");
  if ((res.status === 403 || res.status === 429) && remaining === "0") {
    const reset = Number(res.headers.get("x-ratelimit-reset"));
    if (Number.isFinite(reset)) {
      return Math.max(0, reset * 1000 - Date.now());
    }
  }

  // A 403 with budget left is a permissions problem, and retrying it just
  // spends the budget. Only the limit cases and GitHub's own 5xx come back.
  if (res.status === 429) return 1000 * 2 ** attempt;
  if (res.status >= 500) return 1000 * 2 ** attempt;
  return null;
}

export class GitHubClient {
  /**
   * Last ETag seen per path, for the listings the poller re-reads constantly.
   *
   * A 304 costs nothing against the hourly budget, which is what makes a
   * one-minute poll interval affordable across a team's repositories. The map
   * is per-client and in-memory: a restart pays for one full listing per repo
   * and is back to conditional requests immediately after.
   */
  private readonly etags = new Map<string, { etag: string; body: unknown }>();

  constructor(private token: string = resolveGithubToken()) {}

  private async send(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<Response> {
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      let res: Response;
      try {
        res = await fetch(`${API}${path}`, {
          method,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            ...(body ? { "Content-Type": "application/json" } : {}),
            ...extraHeaders,
          },
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (err) {
        // DNS, TLS, a dropped socket. Transient in the same way a 5xx is.
        lastError = err;
        if (attempt === MAX_ATTEMPTS - 1) break;
        await sleep(1000 * 2 ** attempt);
        continue;
      }

      if (res.ok || res.status === 304) return res;

      const delay = retryDelay(res, attempt);
      if (delay === null || attempt === MAX_ATTEMPTS - 1) return res;
      if (delay > MAX_BACKOFF_MS) {
        const reset = res.headers.get("x-ratelimit-reset");
        throw new Error(
          `GitHub rate limit exhausted; resets in ${Math.round(delay / 1000)}s` +
            (reset ? ` (at ${new Date(Number(reset) * 1000).toISOString()})` : "") +
            `. ${method} ${path}`,
        );
      }
      await sleep(delay);
    }

    const detail = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`GitHub ${method} ${path} failed after ${MAX_ATTEMPTS} attempts: ${detail}`);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.send(method, path, body);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub ${method} ${path} → ${res.status}: ${text.slice(0, 500)}`);
    }
    return (await res.json()) as T;
  }

  /**
   * A GET that spends no rate-limit budget when nothing has changed.
   *
   * Only worth using where the same path is read on a loop — the poller's
   * per-repository listing. Everywhere else the cached body is dead weight.
   */
  private async requestCached<T>(path: string): Promise<T> {
    const cached = this.etags.get(path);
    const res = await this.send(
      "GET",
      path,
      undefined,
      cached ? { "If-None-Match": cached.etag } : undefined,
    );

    if (res.status === 304 && cached) return cached.body as T;

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub GET ${path} → ${res.status}: ${text.slice(0, 500)}`);
    }

    const parsed = (await res.json()) as T;
    const etag = res.headers.get("etag");
    if (etag) this.etags.set(path, { etag, body: parsed });
    return parsed;
  }

  async getPR(ref: PRRef): Promise<PRMeta> {
    const d = await this.request<any>("GET", `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`);
    return {
      ...ref,
      title: d.title,
      body: d.body ?? "",
      author: d.user?.login ?? "unknown",
      url: d.html_url,
      baseRef: d.base.ref,
      headRef: d.head.ref,
      headSha: d.head.sha,
      isDraft: !!d.draft,
      labels: (d.labels ?? []).map((l: any) => l.name),
    };
  }

  async listFiles(ref: PRRef): Promise<PRFile[]> {
    const files: PRFile[] = [];
    for (let page = 1; page <= 10; page++) {
      const batch = await this.request<any[]>(
        "GET",
        `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/files?per_page=100&page=${page}`,
      );
      files.push(
        ...batch.map((f) => ({
          path: f.filename,
          status: f.status,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch,
        })),
      );
      if (batch.length < 100) break;
    }
    return files;
  }

  /** Post the full review: summary body + inline comments in one call. */
  /** Every open pull request on a repository, newest first. */
  async listOpenPRs(owner: string, repo: string): Promise<PRListItem[]> {
    const out: PRListItem[] = [];
    for (let page = 1; page <= 10; page++) {
      const batch = await this.requestCached<any[]>(
        `/repos/${owner}/${repo}/pulls?state=open&per_page=100&page=${page}&sort=updated&direction=desc`,
      );
      out.push(
        ...batch.map((d) => ({
          number: d.number as number,
          title: d.title as string,
          author: (d.user?.login ?? "unknown") as string,
          url: d.html_url as string,
          headSha: d.head.sha as string,
          isDraft: !!d.draft,
          requestedReviewers: ((d.requested_reviewers ?? []) as any[]).map(
            (r) => r.login as string,
          ),
          createdAt: Date.parse(d.created_at),
          updatedAt: Date.parse(d.updated_at),
        })),
      );
      if (batch.length < 100) break;
    }
    return out;
  }

  /**
   * How a pull request ended.
   *
   * The poller learns that a pull request closed by watching it fall off the
   * open listing, which cannot say whether it was merged or abandoned — and
   * guessing puts a wrong badge on the row and makes every merge-time chart
   * permanently empty. One request per pull request, once, when it leaves the
   * listing: the state moves away from `open` so this never repeats.
   */
  /**
   * Every repository an owner has that this token can see.
   *
   * An organisation and a user are different endpoints and a token cannot
   * know which it is looking at without asking, so this tries the
   * organisation first and falls back — one wasted 404 the first time, then
   * the ETag cache makes both cheap.
   *
   * Forks are included: plenty of teams review on a fork. Archived
   * repositories are returned with the flag set rather than filtered here,
   * because the caller decides what an archived repository means.
   */
  async listOwnerRepos(owner: string): Promise<RepoListItem[]> {
    for (const base of [`/orgs/${owner}/repos`, `/users/${owner}/repos`]) {
      try {
        const out: RepoListItem[] = [];
        for (let page = 1; page <= 10; page++) {
          const batch = await this.requestCached<any[]>(
            `${base}?per_page=100&page=${page}&sort=updated&direction=desc`,
          );
          out.push(
            ...batch.map((r) => ({
              owner: r.owner?.login ?? owner,
              name: r.name as string,
              archived: !!r.archived,
              isPrivate: !!r.private,
            })),
          );
          if (batch.length < 100) break;
        }
        return out;
      } catch (err) {
        // Only a 404 means "wrong kind of account, try the other endpoint".
        // A 401, a 403 or a rate limit is a real failure and must surface.
        if (!/→ 404:/.test(err instanceof Error ? err.message : "")) throw err;
      }
    }
    throw new Error(`GitHub knows no user or organisation called ${owner}.`);
  }

  /** The account this token acts as. */
  async getViewer(): Promise<GithubIdentity> {
    const d = await this.request<any>("GET", "/user");
    return { login: d.login, name: d.name ?? null };
  }

  async getPRState(ref: PRRef): Promise<PRState> {
    const d = await this.request<any>(
      "GET",
      `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`,
    );
    // `merged_at` is the authority. `merged` agrees with it, but only the
    // timestamp can answer "how long did this take", which is the whole
    // reason for asking.
    const mergedAt = d.merged_at ? Date.parse(d.merged_at) : null;
    return {
      state: mergedAt !== null ? "merged" : d.state === "open" ? "open" : "closed",
      mergedAt,
    };
  }

  async getPRSize(ref: PRRef): Promise<PRSize> {
    const d = await this.request<any>(
      "GET",
      `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`,
    );
    return {
      additions: d.additions ?? 0,
      deletions: d.deletions ?? 0,
      changedFiles: d.changed_files ?? 0,
    };
  }

  /**
   * Only a reviewer's most recent review counts: an APPROVED that a later
   * CHANGES_REQUESTED superseded is not an approval, and the queue would be
   * lying if it said otherwise.
   */
  async listReviewDecisions(ref: PRRef): Promise<ReviewDecisions> {
    const reviews = await this.request<any[]>(
      "GET",
      `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/reviews?per_page=100`,
    );
    const latest = new Map<string, string>();
    for (const r of reviews) {
      const login = r.user?.login;
      if (!login) continue;
      if (r.state === "APPROVED" || r.state === "CHANGES_REQUESTED") {
        latest.set(login, r.state);
      }
    }
    const approvals: string[] = [];
    const changesRequested: string[] = [];
    for (const [login, state] of latest) {
      (state === "APPROVED" ? approvals : changesRequested).push(login);
    }
    return { approvals, changesRequested };
  }

  async postReview(
    ref: PRRef,
    headSha: string,
    body: string,
    comments: InlineComment[],
  ): Promise<{ html_url: string }> {
    return this.request("POST", `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/reviews`, {
      commit_id: headSha,
      body,
      // Komodo prepares a human review. Keeping this out of the caller's hands
      // makes an AI approval or change request impossible through this client.
      event: "COMMENT",
      comments,
    });
  }

  /**
   * Post a single inline comment on the diff, outside of any review. Used when
   * a reviewer asks the author a question about one judgement.
   */
  async createReviewComment(
    ref: PRRef,
    headSha: string,
    path: string,
    line: number,
    body: string,
  ): Promise<ReviewComment> {
    return this.request("POST", `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/comments`, {
      commit_id: headSha,
      path,
      line,
      side: "RIGHT",
      body,
    });
  }

  /** Every inline review comment on the PR. Replies carry `in_reply_to_id`. */
  async listReviewComments(ref: PRRef): Promise<ReviewComment[]> {
    const out: ReviewComment[] = [];
    for (let page = 1; page <= 10; page++) {
      const batch = await this.request<ReviewComment[]>(
        "GET",
        `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/comments?per_page=100&page=${page}`,
      );
      out.push(...batch);
      if (batch.length < 100) break;
    }
    return out;
  }

  /** Every comment on the pull request that is not anchored to the diff. */
  async listIssueComments(ref: PRRef): Promise<IssueComment[]> {
    const out: IssueComment[] = [];
    for (let page = 1; page <= 10; page++) {
      const batch = await this.request<any[]>(
        "GET",
        `/repos/${ref.owner}/${ref.repo}/issues/${ref.number}/comments?per_page=100&page=${page}`,
      );
      out.push(
        ...batch.map((c) => ({
          id: c.id as number,
          author: (c.user?.login ?? "unknown") as string,
          body: (c.body ?? "") as string,
          html_url: c.html_url as string,
          createdAt: Date.parse(c.created_at),
          updatedAt: Date.parse(c.updated_at ?? c.created_at),
        })),
      );
      if (batch.length < 100) break;
    }
    return out;
  }

  /** Every submitted review, with its body and state. */
  async listReviews(ref: PRRef): Promise<SubmittedReview[]> {
    const out: SubmittedReview[] = [];
    for (let page = 1; page <= 10; page++) {
      const batch = await this.request<any[]>(
        "GET",
        `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/reviews?per_page=100&page=${page}`,
      );
      out.push(
        ...batch.map((r) => ({
          id: r.id as number,
          author: (r.user?.login ?? "unknown") as string,
          state: r.state as SubmittedReview["state"],
          body: (r.body ?? "") as string,
          html_url: r.html_url as string,
          submittedAt: r.submitted_at ? Date.parse(r.submitted_at) : null,
        })),
      );
      if (batch.length < 100) break;
    }
    return out;
  }

  /**
   * What every open pull request's checks add up to, for one repository.
   *
   * Two points per page — see CHECK_ROLLUP_QUERY, where the arithmetic is
   * spelled out, because an earlier version of this cost fifty times more and
   * would have taken a deployment's whole GraphQL budget on one repository.
   *
   * The rollup carries a state and nothing else. `failingChecks` fills in the
   * names for the pull requests this says are red, and the caller decides how
   * many of those it is willing to pay for.
   *
   * Returns an empty map for a repository the token cannot see — no
   * information, so the caller writes no rollup rather than a wrong one.
   * Anything else throws, and the caller decides whether one broken repository
   * is worth abandoning a pass over.
   *
   * A GraphQL response can carry good data and an error together — a
   * repository readable but one pull request in it not — and this keeps what it
   * was given. Discarding sixty rollups because the sixty-first was forbidden
   * would be throwing away the answer to the question.
   */
  async checkRollups(owner: string, repo: string): Promise<Map<number, CheckRollup>> {
    const out = new Map<number, CheckRollup>();
    let cursor: string | null = null;

    for (let page = 0; page < 10; page++) {
      const answer: { data?: any; errors?: GraphqlError[] } =
        await this.graphqlPartial<any>(CHECK_ROLLUP_QUERY, {
          owner,
          name: repo,
          cursor,
        });
      const errors = answer.errors;
      const connection: any = answer.data?.repository?.pullRequests;
      if (!connection) {
        // Nothing usable came back. A missing or invisible repository is the
        // expected case and answers with an empty map; anything else is a
        // failure the caller has to hear about.
        if (errors?.length && !errors.some(isMissingRepository)) {
          throw new Error(`GitHub GraphQL: ${errors.map((e) => e.message).join("; ")}`);
        }
        break;
      }

      for (const node of connection.nodes ?? []) {
        const commit = node?.commits?.nodes?.[0]?.commit;
        if (!commit?.oid || typeof node.number !== "number") continue;
        const rollupState = commit.statusCheckRollup?.state;
        out.set(node.number, {
          number: node.number,
          headSha: commit.oid,
          // No rollup at all means the commit has no checks, which is a
          // different fact from every check passing and must never render as
          // one. A state GitHub has added and this client has not met is
          // pending: guessing the alarming answer is still guessing.
          state: commit.statusCheckRollup
            ? ROLLUP_STATE[rollupState] ?? "pending"
            : "neutral",
          failing: [],
        });
      }

      // `endCursor` can be null while `hasNextPage` is true. Following it
      // re-requests page one — ten times, at full price, making no progress.
      const next = connection.pageInfo?.hasNextPage
        ? connection.pageInfo.endCursor
        : null;
      if (!next) break;
      cursor = next;
    }
    return out;
  }

  /**
   * The names of the checks failing on one commit, and how many there are.
   *
   * One point, and only worth spending on a commit the rollup already called
   * red. Returns null when the detail could not be read, which the caller shows
   * as a failure with no names rather than as a failure that has none.
   */
  async failingChecks(
    owner: string,
    repo: string,
    oid: string,
  ): Promise<CheckDetail | null> {
    const answer = await this.graphqlPartial<any>(FAILING_CHECKS_QUERY, {
      owner,
      name: repo,
      oid,
    });
    const contexts = answer.data?.repository?.object?.statusCheckRollup?.contexts;
    if (!contexts) return null;
    return tallyContexts(contexts.nodes ?? [], contexts.totalCount);
  }

  /**
   * Submit a review as the token's own account.
   *
   * The counterpart to `postReview`, and separate from it on purpose. That one
   * is what the automated pipeline calls and it can only ever COMMENT. This one
   * takes the event as an argument because a person chose it, and it is only
   * reachable from a surface that has that person's own credentials — an
   * approval on GitHub has to name whoever actually approved.
   */
  async submitHumanReview(
    ref: PRRef,
    input: { event: HumanReviewEvent; body: string; headSha?: string },
  ): Promise<{ html_url: string; state: string; id: number }> {
    return this.request(
      "POST",
      `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/reviews`,
      {
        ...(input.headSha ? { commit_id: input.headSha } : {}),
        body: input.body,
        event: input.event,
      },
    );
  }

  /** Add a comment to the pull request conversation. */
  async createIssueComment(ref: PRRef, body: string): Promise<IssueComment> {
    const c = await this.request<any>(
      "POST",
      `/repos/${ref.owner}/${ref.repo}/issues/${ref.number}/comments`,
      { body },
    );
    return {
      id: c.id,
      author: c.user?.login ?? "unknown",
      body: c.body ?? "",
      html_url: c.html_url,
      createdAt: Date.parse(c.created_at),
      updatedAt: Date.parse(c.updated_at ?? c.created_at),
    };
  }

  /** Reply to an existing inline comment, keeping the thread together. */
  async replyToReviewComment(
    ref: PRRef,
    commentId: number,
    body: string,
  ): Promise<ReviewComment> {
    return this.request(
      "POST",
      `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/comments/${commentId}/replies`,
      { body },
    );
  }

  /**
   * One GraphQL query, with whatever it answered.
   *
   * GraphQL replies 200 with an `errors` array rather than a status code, and —
   * unlike REST — it can put data and errors in the same response. Throwing on
   * any error at all would discard perfectly good rows because one node in the
   * result was forbidden, so the decision belongs to the caller, which is the
   * only place that knows whether a partial answer is worth having.
   */
  private async graphqlPartial<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<{ data?: T; errors?: GraphqlError[] }> {
    return this.request<{ data?: T; errors?: GraphqlError[] }>("POST", "/graphql", {
      query,
      variables,
    });
  }

  /** Create or update the marker-tagged walkthrough comment. */
  async upsertWalkthroughComment(ref: PRRef, marker: string, body: string): Promise<{ html_url: string }> {
    const comments = await this.request<any[]>(
      "GET",
      `/repos/${ref.owner}/${ref.repo}/issues/${ref.number}/comments?per_page=100`,
    );
    const existing = comments.find((c) => typeof c.body === "string" && c.body.includes(marker));
    if (existing) {
      return this.request("PATCH", `/repos/${ref.owner}/${ref.repo}/issues/comments/${existing.id}`, { body });
    }
    return this.request("POST", `/repos/${ref.owner}/${ref.repo}/issues/${ref.number}/comments`, { body });
  }

  /** Inject/update a marker-delimited "Summary by Komodo" block in the PR description. */
  async updateDescription(ref: PRRef, currentBody: string, block: string): Promise<void> {
    const START = "<!-- komodo-summary-start -->";
    const END = "<!-- komodo-summary-end -->";
    const wrapped = `${START}\n${block}\n${END}`;
    const body = currentBody.includes(START)
      ? currentBody.replace(new RegExp(`${START}[\\s\\S]*?${END}`), wrapped)
      : `${currentBody}\n\n${wrapped}`;
    await this.request("PATCH", `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`, { body });
  }

  async postStatus(
    ref: PRRef,
    sha: string,
    state: "success" | "failure" | "pending",
    description: string,
  ): Promise<void> {
    await this.request("POST", `/repos/${ref.owner}/${ref.repo}/statuses/${sha}`, {
      state,
      context: "komodo/verification",
      description: description.slice(0, 140),
    });
  }
}

interface GraphqlError {
  message: string;
  type?: string;
}

/**
 * A repository this token cannot see, as opposed to a query that went wrong.
 *
 * GitHub says the same thing for "does not exist" and "exists, and you may not
 * know that" — deliberately, and the distinction is not one a poller needs.
 * Either way there is nothing to read and no rollup to write.
 */
function isMissingRepository(error: GraphqlError): boolean {
  return error.type === "NOT_FOUND" || /Could not resolve to a Repository/i.test(error.message);
}

/**
 * Every open pull request's head commit and the one word its checks add up to.
 *
 * The shape of this query is the whole cost story, so it is worth being exact.
 * GitHub prices a GraphQL query from the `first`/`last` arguments on its
 * connections, before it runs: the node count is the product down each path,
 * divided by 100. An earlier version of this asked for each commit's hundred
 * check contexts —
 *
 *     pullRequests(first:100)                  →     100
 *       commits(last:1)          100 × 1       →     100
 *         contexts(first:100)    100 × 1 × 100 →  10,000
 *                                  10,200 / 100 = 102 points
 *
 * — against an hourly budget of 5,000. One repository on a one-minute poll
 * would have spent 6,120 points an hour: the entire budget, for one repository,
 * every hour, forever. That is not a tuning problem, it is the wrong query.
 *
 * `statusCheckRollup { state }` is a single object with a scalar on it, so it
 * adds no nodes at all:
 *
 *     pullRequests(first:100)                  →     100
 *       commits(last:1)          100 × 1       →     100
 *                                     200 / 100 = 2 points
 *
 * That answers the only question the queue column asks — is this green, red, or
 * still running. The names of the failing checks cost more, so they are fetched
 * separately and only for the pull requests that are actually red, which is a
 * small minority of any repository. See `failingChecks`.
 *
 * Ordered by CREATED_AT descending. Descending because the ten-page cap means a
 * repository with more than a thousand open pull requests gets partial
 * coverage, and the newest are the ones under review — ascending spent the
 * whole budget on the stalest half. CREATED_AT rather than UPDATED_AT because
 * this pages with a cursor, and a sort key that changes while the pages are
 * being read moves rows between them.
 */
const CHECK_ROLLUP_QUERY = `
query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(states: OPEN, first: 100, after: $cursor, orderBy: {field: CREATED_AT, direction: DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number
        commits(last: 1) {
          nodes { commit { oid statusCheckRollup { state } } }
        }
      }
    }
  }
}`;

/**
 * The failing checks on one commit, by name.
 *
 * A second query, for the pull requests the cheap one said were red. It costs
 * 1 point — one commit, one contexts connection of 100 — and it only runs for
 * a failing pull request, which is a handful per repository rather than all of
 * them.
 */
const FAILING_CHECKS_QUERY = `
query($owner: String!, $name: String!, $oid: GitObjectID!) {
  repository(owner: $owner, name: $name) {
    object(oid: $oid) {
      ... on Commit {
        statusCheckRollup {
          contexts(first: 100) {
            totalCount
            nodes {
              __typename
              ... on CheckRun { name conclusion status }
              ... on StatusContext { context state }
            }
          }
        }
      }
    }
  }
}`;

/**
 * GitHub's rollup vocabulary, folded into Komodo's.
 *
 * `EXPECTED` is a status somebody declared and no system has answered yet, so
 * it is pending in the sense the column means. A rollup that is absent entirely
 * — no checks on this commit — is handled by the caller, because null is not a
 * state.
 */
const ROLLUP_STATE: Record<string, ChecksState> = {
  SUCCESS: "passing",
  FAILURE: "failing",
  ERROR: "failing",
  PENDING: "pending",
  EXPECTED: "pending",
};

/**
 * Conclusions that finished without blocking anything.
 *
 * Skipped and neutral runs count as passed: they are not going to stop a merge,
 * and calling them pending would leave a queue row spinning forever on a check
 * that already finished.
 */
const PASSING_CONCLUSIONS = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);

/**
 * Conclusions that are a real failure, named exhaustively.
 *
 * Listed rather than inferred as "everything else" — see `tallyContexts` for
 * why the difference matters. `CANCELLED` is here because a required check that
 * was cancelled did not pass, and a merge waits on it either way.
 */
const FAILING_CONCLUSIONS = new Set([
  "FAILURE",
  "TIMED_OUT",
  "CANCELLED",
  "ACTION_REQUIRED",
  "STARTUP_FAILURE",
]);

/**
 * Fold a commit's check contexts into one answer.
 *
 * A check run and a commit status say the same thing in two vocabularies, and
 * both appear in the same list.
 *
 * Both the passing and the failing sets are named exhaustively, and anything in
 * neither is counted as pending. That asymmetry is deliberate. The obvious
 * shape — "these pass, everything else fails" — means GitHub adding one enum
 * value, or Komodo meeting a `STALE` run it had not thought about, puts a red
 * build on a queue row and names a check as broken that is not. Guessing the
 * alarming answer is still guessing, and the store's own rule for this data
 * (see readChecks) is that an unknown state is admitted rather than invented.
 * A wrongly-pending check reads as "not finished yet", which is the honest
 * description of a value nobody here understands.
 */
function tallyContexts(nodes: any[], totalCount?: number): CheckDetail {
  let passed = 0;
  let failed = 0;
  let pending = 0;
  const failing: string[] = [];

  for (const node of nodes) {
    if (node?.__typename === "CheckRun") {
      const name = (node.name ?? "check") as string;
      // A run GitHub has superseded describes a commit state that no longer
      // applies. GitHub leaves it out of its own rollup; so does this.
      if (node.conclusion === "STALE") continue;
      // Not finished. `status` is the authority on that, and a run can carry a
      // status of QUEUED or IN_PROGRESS with no conclusion at all.
      if (node.conclusion == null || node.status !== "COMPLETED") {
        pending++;
        continue;
      }
      if (PASSING_CONCLUSIONS.has(node.conclusion)) passed++;
      else if (FAILING_CONCLUSIONS.has(node.conclusion)) {
        failed++;
        failing.push(name);
      } else pending++;
    } else if (node?.__typename === "StatusContext") {
      const name = (node.context ?? "status") as string;
      if (node.state === "SUCCESS") passed++;
      else if (node.state === "FAILURE" || node.state === "ERROR") {
        failed++;
        failing.push(name);
      } else pending++;
    } else {
      // A union member this client does not know. Counting it would be a
      // guess; skipping it is worse than a guess, because a commit whose only
      // context is unrecognised would then come back as `neutral` — which this
      // vocabulary defines as "no checks at all".
      pending++;
    }
  }

  // More contexts than the page returned. Nothing here can say what is in the
  // part that was not read, and the one answer that must never be given on
  // incomplete information is "passing".
  const truncated = typeof totalCount === "number" && totalCount > nodes.length;
  if (truncated) pending += totalCount - nodes.length;

  const total = passed + failed + pending;
  const state: ChecksState =
    total === 0 ? "neutral" : failed > 0 ? "failing" : pending > 0 ? "pending" : "passing";
  // Deduplicated: GitHub genuinely repeats a context name — two workflows with
  // the same job name, or a re-run — and a list with repeats is a list a UI
  // cannot key on.
  return { state, total, passed, failed, pending, failing: [...new Set(failing)] };
}

export function judgementToComment(j: Judgement, body: string): InlineComment {
  const multi = j.endLine !== undefined && j.endLine > j.line;
  return {
    path: j.path,
    line: multi ? j.endLine! : j.line,
    ...(multi ? { start_line: j.line, start_side: "RIGHT" as const } : {}),
    side: "RIGHT",
    body,
  };
}
