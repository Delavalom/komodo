import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

import type { AacrInstance } from "./types.js";

const execFileAsync = promisify(execFile);

/** Runs git; resolves stdout, rejects with stderr in the message. */
export type GitRunner = (args: string[], opts?: { cwd?: string; noLazyFetch?: boolean }) => Promise<string>;

const GIT_ENV = { GIT_LFS_SKIP_SMUDGE: "1", GIT_TERMINAL_PROMPT: "0" };

export const defaultGit: GitRunner = async (args, opts = {}) => {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd: opts.cwd,
      env: { ...process.env, ...GIT_ENV, ...(opts.noLazyFetch ? { GIT_NO_LAZY_FETCH: "1" } : {}) },
      maxBuffer: 256 * 1024 * 1024,
    });
    return stdout;
  } catch (err) {
    const e = err as { stderr?: string; message?: string };
    throw new Error(`git ${args.join(" ")} failed: ${(e.stderr || e.message || "").trim()}`);
  }
};

/**
 * AACR-Bench's repository snapshots on Hugging Face, pinned to the revision
 * current when this harness was written. A pull request's branch can be
 * force-pushed after review, and then GitHub no longer serves its head by any
 * ref — keycloak/keycloak#36457 is one. The snapshots hold those commits;
 * `SHA256SUMS` in the same revision verifies each archive.
 */
export const AACR_SNAPSHOTS = {
  repoId: "Alibaba-Aone/aacr-bench-repos",
  revision: "6f0a49005a246a3df5369731c7445968052801e2",
} as const;

function snapshotUrl(file: string): string {
  return `https://huggingface.co/datasets/${AACR_SNAPSHOTS.repoId}/resolve/${AACR_SNAPSHOTS.revision}/repos/${encodeURIComponent(file)}`;
}

/** `SHA256SUMS` lines → file name to digest, as `parse_sha256sums_text` reads them. */
export function parseSha256Sums(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^([0-9a-fA-F]{64})\s+\*?(\S+)\s*$/.exec(line.trim());
    if (!m) continue;
    let name = m[2].replaceAll("\\", "/");
    if (name.startsWith("./")) name = name.slice(2);
    if (name.startsWith("repos/")) name = name.slice("repos/".length);
    else if (name.includes("/")) continue;
    if (!name || name.includes("/") || !name.endsWith(".tar.gz")) continue;
    out.set(name, m[1].toLowerCase());
  }
  return out;
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

/** Where one repository's clone lives: `<cache>/repos/owner__name`, as upstream names it. */
export function repoCachePath(cacheDir: string, repo: string): string {
  if (repo.split("/").length !== 2 || repo.split("/").some((p) => !p || p === "." || p === "..")) {
    throw new Error(`Not an owner/name repository: ${repo}`);
  }
  return join(cacheDir, "repos", repo.replace("/", "__"));
}

export interface PreparedRepo {
  /** A worktree checked out, clean, at the instance's head. Reviewers run here. */
  path: string;
  /** merge-base(base, head): where the reviewed change starts. */
  mergeBase: string;
}

/**
 * Prepares a checkout per instance the way `repo_utils.RepoPreparer` does for
 * its GitHub path — a partial clone, both commits fetched, the merge-base
 * resolved, the head checked out clean — with two differences that only
 * change where files sit:
 *
 * - The clone is kept under `~/.cache/komodo/aacr/repos` and reused by every
 *   run; only missing commits are fetched.
 * - Each instance gets its own worktree at its head, so two pull requests
 *   from one repository can be reviewed at once without one checkout pulling
 *   the files out from under the other's agent.
 *
 * Clone modes are tried in upstream's order: treeless, blobless, full. A
 * treeless clone is commits only, which is all merge-base needs; git's lazy
 * fetch then brings a whole tree (without blobs) in one request, and the
 * worktree checkout and the diff each fetch their blobs in one batch. On a
 * repository with a long history that is minutes against hours: a blobless
 * clone of ClickHouse was past 6 GB before it was stopped.
 */
export class AacrRepoPreparer {
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly cacheDir: string,
    private readonly opts: {
      git?: GitRunner;
      log?: (msg: string) => void;
      remoteUrl?: (repo: string) => string;
      fetch?: typeof fetch;
    } = {},
  ) {}

  private get git(): GitRunner {
    return this.opts.git ?? defaultGit;
  }

  private log(msg: string): void {
    this.opts.log?.(msg);
  }

  /** Runs `task` with this repository's clone to itself. */
  private withRepoLock<T>(repo: string, task: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(repo) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    this.locks.set(repo, next);
    return next;
  }

  async prepare(instance: AacrInstance): Promise<PreparedRepo> {
    return this.withRepoLock(instance.repo, async () => {
      const clone = await this.ensureClone(instance.repo);
      for (const commit of new Set([instance.baseCommit, instance.headCommit])) {
        await this.ensureCommit(instance.repo, clone, commit);
      }
      const mergeBase = (
        await this.git(["merge-base", instance.baseCommit, instance.headCommit], { cwd: clone, noLazyFetch: true })
      ).trim();
      if (!mergeBase) throw new Error(`No merge-base for ${instance.baseCommit}...${instance.headCommit}`);
      const path = await this.ensureWorktree(clone, instance);
      // Fetch the changed files' blobs now, under the lock, rather than from
      // two reviews' diffs at once.
      await this.git(["diff", "--numstat", `${mergeBase}...${instance.headCommit}`], { cwd: path });
      return { path, mergeBase };
    });
  }

  private async ensureClone(repo: string): Promise<string> {
    const clone = repoCachePath(this.cacheDir, repo);
    if (existsSync(join(clone, "HEAD")) || existsSync(join(clone, ".git", "HEAD"))) return clone;
    const partialRoot = join(this.cacheDir, "repos", ".partial");
    mkdirSync(partialRoot, { recursive: true });
    const url = this.opts.remoteUrl?.(repo) ?? `https://github.com/${repo}.git`;
    let lastError = "";
    for (const [mode, extra] of [
      ["treeless", ["--filter=tree:0"]],
      ["blobless", ["--filter=blob:none"]],
      ["full", []],
    ] as const) {
      const temp = join(partialRoot, `${repo.replace("/", "__")}-${mode}-${process.pid}-${Date.now()}`);
      this.log(`cloning ${repo} (${mode})…`);
      try {
        await this.git(["clone", "--no-checkout", "--no-tags", ...extra, url, temp]);
        renameSync(temp, clone);
        return clone;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        rmSync(temp, { recursive: true, force: true });
      }
    }
    throw new Error(`Cloning ${repo} failed: ${lastError}`);
  }

  private async hasCommit(clone: string, commit: string): Promise<boolean> {
    try {
      await this.git(["cat-file", "-e", `${commit}^{commit}`], { cwd: clone, noLazyFetch: true });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * A commit from GitHub, and failing that from the benchmark's snapshot of
   * the repository: fetched out of the extracted snapshot into the clone, so
   * everything after this reads one repository whichever source served it.
   */
  private async ensureCommit(repo: string, clone: string, commit: string): Promise<void> {
    if (await this.hasCommit(clone, commit)) return;
    this.log(`fetching ${commit.slice(0, 12)}…`);
    try {
      await this.git(["fetch", "--no-tags", "origin", commit], { cwd: clone });
    } catch {
      await this.git(["fetch", "--tags", "origin"], { cwd: clone }).catch(() => undefined);
    }
    if (await this.hasCommit(clone, commit)) return;

    this.log(`${commit.slice(0, 12)} is not on GitHub any more; using the AACR-Bench snapshot of ${repo}…`);
    const snapshot = await this.ensureSnapshot(repo);
    await this.git(["fetch", "--no-tags", snapshot, commit], { cwd: clone }).catch((err) => {
      throw new Error(`Commit ${commit} is not on GitHub or in the AACR-Bench snapshot: ${err instanceof Error ? err.message : String(err)}`);
    });
    if (!(await this.hasCommit(clone, commit))) {
      throw new Error(`Commit ${commit} is not on GitHub or in the AACR-Bench snapshot.`);
    }
  }

  /** The repository's snapshot, downloaded, verified and extracted once into the cache. */
  private async ensureSnapshot(repo: string): Promise<string> {
    const name = repo.replace("/", "__");
    const dir = join(this.cacheDir, "snapshots", name);
    if (existsSync(join(dir, ".git"))) return dir;
    const doFetch = this.opts.fetch ?? fetch;
    const archives = join(this.cacheDir, "snapshots", ".archives");
    mkdirSync(archives, { recursive: true });

    const sumsResponse = await doFetch(snapshotUrl("SHA256SUMS"));
    if (!sumsResponse.ok) throw new Error(`Snapshot checksums unavailable: HTTP ${sumsResponse.status}`);
    const expected = parseSha256Sums(await sumsResponse.text()).get(`${name}.tar.gz`);
    if (!expected) throw new Error(`AACR-Bench has no snapshot of ${repo}.`);

    const archive = join(archives, `${name}.tar.gz`);
    if (!existsSync(archive) || (await sha256File(archive)) !== expected) {
      this.log(`downloading the snapshot of ${repo}…`);
      const response = await doFetch(snapshotUrl(`${name}.tar.gz`));
      if (!response.ok || !response.body) throw new Error(`Snapshot download failed: HTTP ${response.status}`);
      const partial = `${archive}.part`;
      await pipeline(Readable.fromWeb(response.body as never), createWriteStream(partial));
      const actual = await sha256File(partial);
      if (actual !== expected) {
        rmSync(partial, { force: true });
        throw new Error(`Snapshot of ${repo} failed its checksum: expected ${expected}, got ${actual}`);
      }
      renameSync(partial, archive);
    }

    // bsdtar and GNU tar both refuse absolute paths and `..` by default; the
    // one top-level directory is then checked before anything uses it.
    const staging = mkdtempSync(join(this.cacheDir, "snapshots", `.extract-${name}-`));
    try {
      await execFileAsync("tar", ["-xzf", archive, "-C", staging]);
      const top = readdirSync(staging);
      if (top.length !== 1 || !existsSync(join(staging, top[0], ".git"))) {
        throw new Error(`Snapshot of ${repo} does not hold one git repository.`);
      }
      renameSync(join(staging, top[0]), dir);
    } finally {
      rmSync(staging, { recursive: true, force: true });
    }
    // Let the clone ask the snapshot for a commit by id, not only by ref.
    await this.git(["config", "uploadpack.allowAnySHA1InWant", "true"], { cwd: dir });
    return dir;
  }

  private async ensureWorktree(clone: string, instance: AacrInstance): Promise<string> {
    const path = join(this.cacheDir, "worktrees", instance.id.replaceAll("/", "__"));
    if (existsSync(join(path, ".git"))) {
      try {
        const head = (await this.git(["rev-parse", "HEAD"], { cwd: path })).trim();
        if (head === instance.headCommit) {
          // A reviewer that wrote anything leaves it here; the next one must
          // not read it. Upstream cleans the same way between reviews.
          await this.git(["reset", "--hard", "--quiet"], { cwd: path });
          await this.git(["clean", "-fdxq"], { cwd: path });
          return path;
        }
      } catch {
        // Fall through and rebuild it.
      }
    }
    rmSync(path, { recursive: true, force: true });
    await this.git(["worktree", "prune"], { cwd: clone });
    mkdirSync(join(this.cacheDir, "worktrees"), { recursive: true });
    this.log(`checking out ${instance.id}…`);
    await this.git(["worktree", "add", "--detach", "--force", path, instance.headCommit], { cwd: clone });
    return path;
  }
}
