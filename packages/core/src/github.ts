import { execFileSync } from "node:child_process";
import type { Finding } from "./schema.js";

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

export interface PRFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
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

export class GitHubClient {
  constructor(private token: string = resolveGithubToken()) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub ${method} ${path} → ${res.status}: ${text.slice(0, 500)}`);
    }
    return (await res.json()) as T;
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
  async postReview(
    ref: PRRef,
    headSha: string,
    body: string,
    event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT",
    comments: InlineComment[],
  ): Promise<{ html_url: string }> {
    return this.request("POST", `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/reviews`, {
      commit_id: headSha,
      body,
      event,
      comments,
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
      context: "komodo/review",
      description: description.slice(0, 140),
    });
  }
}

export function findingToComment(f: Finding, body: string): InlineComment {
  const multi = f.endLine !== undefined && f.endLine > f.line;
  return {
    path: f.path,
    line: multi ? f.endLine! : f.line,
    ...(multi ? { start_line: f.line, start_side: "RIGHT" as const } : {}),
    side: "RIGHT",
    body,
  };
}
