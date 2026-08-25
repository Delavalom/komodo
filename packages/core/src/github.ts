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
