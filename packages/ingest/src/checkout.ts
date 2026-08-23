/**
 * A working tree for the reviewer.
 *
 * `komodo pr` reviews with the repository on disk: the provider gets Read,
 * Glob and Grep over the real tree, so a judgement can be checked against the
 * code around the patch instead of against the patch alone. The server had
 * none of that, which made a `komodo serve` review quietly weaker than the
 * same review run from a laptop — same prompt, same model, less to look at.
 * This closes that gap.
 *
 * One directory per repository, reused across passes and across pull
 * requests. The fetch is shallow and `refs/pull/<n>/head` always exists, so
 * moving from one pull request to the next costs a fetch rather than a clone,
 * and a fork's head is reachable where its branch name would not be.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface CheckoutRef {
  owner: string;
  name: string;
  number: number;
}

export interface RepoCheckout {
  /**
   * Absolute path to a tree at the pull request's head, or undefined. A
   * diff-only review is a valid review — just a worse one — so every failure
   * here degrades rather than throws.
   */
  prepare(ref: CheckoutRef): Promise<string | undefined>;
}

export interface CheckoutOptions {
  /** Parent directory for the per-repository trees. */
  cacheDir: string;
  /** Omit for public repositories. */
  token?: string;
  onProgress?: (msg: string) => void;
}

export function createCheckout(options: CheckoutOptions): RepoCheckout {
  return {
    async prepare(ref: CheckoutRef): Promise<string | undefined> {
      try {
        return prepare(options, ref);
      } catch (err) {
        // git writes the useful half to stderr, and execFileSync hides it
        // behind a generic "Command failed" message.
        const detail =
          (err as { stderr?: string })?.stderr?.trim() ||
          (err instanceof Error ? err.message : String(err));
        options.onProgress?.(
          `  no working tree (${firstLine(detail)}); reviewing the diff alone.`,
        );
        return undefined;
      }
    },
  };
}

function prepare(options: CheckoutOptions, ref: CheckoutRef): string {
  const dir = join(options.cacheDir, `${ref.owner}-${ref.name}`);

  if (!existsSync(join(dir, ".git"))) {
    mkdirSync(dir, { recursive: true });
    git(options, dir, ["init", "--quiet"]);
    git(options, dir, [
      "remote",
      "add",
      "origin",
      `https://github.com/${ref.owner}/${ref.name}.git`,
    ]);
  }

  git(options, dir, [
    "fetch",
    "--quiet",
    "--depth",
    "1",
    "origin",
    `refs/pull/${ref.number}/head`,
  ]);
  // --force because the previous pull request left its own tree here; the
  // checkout is what makes the directory reusable rather than per-PR.
  git(options, dir, ["checkout", "--quiet", "--detach", "--force", "FETCH_HEAD"]);

  return dir;
}

/**
 * The token goes in the environment, not in argv and not in .git/config.
 *
 * argv is world-readable through `ps` on a shared host, and a credential
 * written into the repository's config outlives the process that needed it.
 * GIT_CONFIG_COUNT (git 2.31+) applies the header for exactly one invocation.
 */
function git(options: CheckoutOptions, cwd: string, args: string[]): void {
  const basic = options.token
    ? Buffer.from(`x-access-token:${options.token}`).toString("base64")
    : undefined;

  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "ignore", "pipe"],
    timeout: 10 * 60 * 1000,
    env: {
      ...process.env,
      // A private repository with no usable token must fail, not block the
      // ingest loop forever on a credential prompt nobody can answer.
      GIT_TERMINAL_PROMPT: "0",
      ...(basic
        ? {
            GIT_CONFIG_COUNT: "1",
            GIT_CONFIG_KEY_0: "http.extraheader",
            GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}`,
          }
        : {}),
    },
  });
}

function firstLine(text: string): string {
  const line = text.split("\n").find((l) => l.trim().length > 0) ?? text;
  return line.length > 120 ? `${line.slice(0, 117)}…` : line;
}
