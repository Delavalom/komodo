import { execFileSync } from "node:child_process";
import { basename } from "node:path";
import type { DiffFile, DiffMeta, DiffSource } from "../diff-source.js";

/**
 * `owner/repo` out of a git remote URL, https or ssh, or null.
 *
 * The same reading `getMeta` has always done, pulled out so that a command
 * checking a checkout against a claim reads the remote exactly as the record
 * that claim produces will.
 */
export function repoFromRemoteUrl(remote: string): { owner: string; repo: string } | null {
  const m = /[:/]([^/]+)\/([^/.]+?)(?:\.git)?$/.exec(remote);
  if (!m?.[1] || !m[2]) return null;
  return { owner: m[1], repo: m[2] };
}

export class LocalGitDiffSource implements DiffSource {
  private repoDir: string;
  private baseBranch: string;
  /**
   * The commit whose change is read. HEAD by default — the branch someone is
   * on. An explicit head reads a range without touching the working tree,
   * which is how the benchmark harness reviews `base...head` of a cached
   * clone; the merge-base is still taken, so the range means what a pull
   * request's diff means.
   */
  private head: string;

  constructor(repoDir: string, baseBranch?: string, head?: string) {
    this.repoDir = repoDir;
    this.baseBranch = baseBranch ?? this.detectBaseBranch();
    this.head = head ?? "HEAD";
  }

  async getMeta(): Promise<DiffMeta> {
    const explicit = this.head !== "HEAD";
    const headSha = this.git(["rev-parse", `${this.head}^{commit}`]);
    const headRef = explicit ? this.head : this.git(["branch", "--show-current"]) || "HEAD";
    const title = this.git(["log", "-1", "--format=%s", this.head]);
    // A branch someone is on is theirs; a named commit is whoever wrote it.
    const author =
      (explicit
        ? this.gitOptional(["log", "-1", "--format=%an", this.head])
        : this.gitOptional(["config", "user.name"])) ?? "unknown";

    let owner = "local";
    let repo = basename(this.repoDir);
    const remote = this.gitOptional(["remote", "get-url", "origin"]);
    const parsed = remote ? repoFromRemoteUrl(remote) : null;
    if (parsed) {
      owner = parsed.owner;
      repo = parsed.repo;
    }

    return {
      owner,
      repo,
      number: 0,
      title,
      author,
      url: "",
      baseRef: this.baseBranch,
      headRef,
      headSha,
      body: "",
      isDraft: false,
      labels: [],
    };
  }

  async getFiles(): Promise<DiffFile[]> {
    const mergeBase = this.git(["merge-base", this.baseBranch, this.head]);
    const range = `${mergeBase}...${this.head}`;
    // -z so a rename arrives as its two paths rather than `a/{x => y}`, which
    // is not a path anything can diff or anchor a comment to.
    const numstat = this.gitRaw(["diff", "--numstat", "-z", range]);
    const files: DiffFile[] = [];
    for (const entry of parseNumstatZ(numstat)) {
      const { additions, deletions, path, from } = entry;
      const status = from ? "renamed" : this.inferStatus(additions, deletions, mergeBase, path);
      const patch = this.gitOptional(
        from
          ? ["diff", "--unified=3", "-M", range, "--", from, path]
          : ["diff", "--unified=3", range, "--", path],
      );
      files.push({ path, status, additions, deletions, patch: patch || undefined });
    }
    return files;
  }

  private detectBaseBranch(): string {
    const symbolic = this.gitOptional(["symbolic-ref", "refs/remotes/origin/HEAD"]);
    if (symbolic) return symbolic.replace("refs/remotes/origin/", "");
    const hasMain = this.gitOptional(["rev-parse", "--verify", "main"]);
    if (hasMain) return "main";
    const hasMaster = this.gitOptional(["rev-parse", "--verify", "master"]);
    if (hasMaster) return "master";
    throw new Error(
      "Could not detect base branch. Neither 'main' nor 'master' exist. " +
      "Specify --base <branch> explicitly.",
    );
  }

  private inferStatus(additions: number, deletions: number, mergeBase: string, path: string): string {
    if (deletions === 0 && additions > 0) {
      const existed = this.gitOptional(["cat-file", "-t", `${mergeBase}:${path}`]);
      if (!existed) return "added";
    }
    if (additions === 0 && deletions > 0) {
      const exists = this.gitOptional(["cat-file", "-t", `${this.head}:${path}`]);
      if (!exists) return "removed";
    }
    return "modified";
  }

  private git(args: string[]): string {
    return this.gitRaw(args).trim();
  }

  private gitRaw(args: string[]): string {
    return execFileSync("git", args, {
      cwd: this.repoDir,
      encoding: "utf8",
      // A large pull request's numstat or patch easily passes the 1 MB default.
      maxBuffer: 256 * 1024 * 1024,
    });
  }

  private gitOptional(args: string[]): string | null {
    try {
      const result = execFileSync("git", args, {
        cwd: this.repoDir,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        maxBuffer: 256 * 1024 * 1024,
      }).trim();
      return result || null;
    } catch {
      return null;
    }
  }
}

/**
 * `git diff --numstat -z` output, one entry per file. A rename is
 * `add\tdel\t\0from\0to\0`; anything else is `add\tdel\tpath\0`. Binary
 * files report `-` for both counts, read here as zero.
 */
export function parseNumstatZ(
  raw: string,
): { additions: number; deletions: number; path: string; from?: string }[] {
  const parts = raw.split("\0");
  const out: { additions: number; deletions: number; path: string; from?: string }[] = [];
  for (let i = 0; i < parts.length; i++) {
    const head = parts[i];
    if (!head) continue;
    const [add, del, inline] = head.split("\t");
    if (add === undefined || del === undefined || inline === undefined) continue;
    const additions = add === "-" ? 0 : parseInt(add, 10);
    const deletions = del === "-" ? 0 : parseInt(del, 10);
    if (inline) {
      out.push({ additions, deletions, path: inline });
    } else {
      const from = parts[++i];
      const to = parts[++i];
      if (from && to) out.push({ additions, deletions, path: to, from });
    }
  }
  return out;
}
