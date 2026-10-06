import { execFileSync } from "node:child_process";

import { repoFromRemoteUrl } from "@komodo/core";

import type { Claim } from "./claim-file.js";

/**
 * Why this directory must not take the claimed head, or null when it may.
 *
 * Pure, so the three refusals are tested without a repository. Each one names
 * the command to run once the person has fixed it, because by the time this
 * runs the job is already claimed and its lease is ticking.
 */
export function checkoutRefusal(input: {
  repoId: string;
  claimPath: string;
  origin: string | null;
  porcelain: string;
}): string | null {
  const retry = `komodo-review checkout ${input.claimPath}`;
  if (!input.origin) {
    return `This directory has no \`origin\` remote, so it cannot be checked against ${input.repoId}. Open a clone of ${input.repoId} and run \`${retry}\`.`;
  }
  const parsed = repoFromRemoteUrl(input.origin);
  const here = parsed ? `${parsed.owner}/${parsed.repo}` : input.origin;
  if (here.toLowerCase() !== input.repoId.toLowerCase()) {
    return `The claim is for ${input.repoId}, but this checkout is ${here}. Open a clone of ${input.repoId} and run \`${retry}\`.`;
  }
  if (input.porcelain.trim()) {
    return `This checkout has uncommitted changes, and checking out the claimed head would carry them into the review. Commit or stash them, then run \`${retry}\`.`;
  }
  return null;
}

/**
 * Detach this checkout at exactly the claimed head.
 *
 * Fetched from `refs/pull/<n>/head` on origin rather than through `gh pr
 * checkout`, so it needs no GitHub CLI and lands on the claimed SHA even when
 * the pull request has moved since: a newer head is not the one the claim
 * leased, and `submit` refuses anything else.
 */
export function checkoutClaim(claim: Claim, claimPath: string, cwd = process.cwd()): void {
  const git = (args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const optional = (args: string[]) => {
    try {
      return git(args);
    } catch {
      return null;
    }
  };

  const refusal = checkoutRefusal({
    repoId: claim.repoId,
    claimPath,
    origin: optional(["remote", "get-url", "origin"]),
    porcelain: optional(["status", "--porcelain", "--untracked-files=no"]) ?? "",
  });
  if (refusal) throw new Error(refusal);

  if (optional(["rev-parse", "HEAD"]) === claim.headSha) return;

  const present = () => optional(["cat-file", "-e", `${claim.headSha}^{commit}`]) !== null;
  if (!present()) optional(["fetch", "--no-tags", "origin", `refs/pull/${claim.number}/head`]);
  if (!present()) optional(["fetch", "--no-tags", "origin", claim.headSha]);
  if (!present()) {
    throw new Error(
      `Could not fetch ${claim.headSha.slice(0, 12)} from origin. The claim is at ${claimPath}; fetch that commit and run \`komodo-review checkout ${claimPath}\`.`,
    );
  }
  git(["checkout", "--quiet", "--detach", claim.headSha]);
}
