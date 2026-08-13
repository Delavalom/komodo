import { execFileSync } from "node:child_process";
import { basename } from "node:path";
import type { DiffFile, DiffMeta, DiffSource } from "../diff-source.js";

export class LocalGitDiffSource implements DiffSource {
  private repoDir: string;
  private baseBranch: string;

  constructor(repoDir: string, baseBranch?: string) {
    this.repoDir = repoDir;
    this.baseBranch = baseBranch ?? this.detectBaseBranch();
  }

  async getMeta(): Promise<DiffMeta> {
    const headSha = this.git(["rev-parse", "HEAD"]);
    const headRef = this.git(["branch", "--show-current"]) || "HEAD";
    const title = this.git(["log", "-1", "--format=%s", "HEAD"]);
    const author = this.gitOptional(["config", "user.name"]) ?? "unknown";

    let owner = "local";
    let repo = basename(this.repoDir);
    const remote = this.gitOptional(["remote", "get-url", "origin"]);
    if (remote) {
      const m = /[:/]([^/]+)\/([^/.]+?)(?:\.git)?$/.exec(remote);
      if (m) {
        owner = m[1];
        repo = m[2];
      }
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
    const mergeBase = this.git(["merge-base", this.baseBranch, "HEAD"]);
    const numstat = this.git(["diff", "--numstat", `${mergeBase}...HEAD`]);
    if (!numstat) return [];

    const files: DiffFile[] = [];
    for (const line of numstat.split("\n")) {
      const [add, del, path] = line.split("\t");
      if (!path) continue;

      const additions = add === "-" ? 0 : parseInt(add, 10);
      const deletions = del === "-" ? 0 : parseInt(del, 10);
      const status = this.inferStatus(additions, deletions, mergeBase, path);
      const patch = this.gitOptional(["diff", "--unified=3", `${mergeBase}...HEAD`, "--", path]);

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
      const exists = this.gitOptional(["cat-file", "-t", `HEAD:${path}`]);
      if (!exists) return "removed";
    }
    return "modified";
  }

  private git(args: string[]): string {
    return execFileSync("git", args, { cwd: this.repoDir, encoding: "utf8" }).trim();
  }

  private gitOptional(args: string[]): string | null {
    try {
      const result = execFileSync("git", args, {
        cwd: this.repoDir,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
      return result || null;
    } catch {
      return null;
    }
  }
}
