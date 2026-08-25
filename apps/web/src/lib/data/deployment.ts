import "server-only";

/**
 * Facts about the running deployment, as opposed to the data in it.
 *
 * The Code Providers screen used to state four of these from memory: a
 * hard-coded organisation name, a hard-coded "Last Sync: ~6 hours ago", a
 * repository count taken from a different question, and four buttons wired to
 * nothing. Every one of them was right on the day it was written and wrong
 * afterwards, which is worse than absent: a connection screen exists to be
 * believed when something has broken.
 *
 * These come from the two places that actually know — the token, and the
 * heartbeats the ingester writes into the store as it works.
 */
import { GitHubClient, resolveGithubToken } from "@komodo/core";
import {
  META_LAST_DISCOVERY_AT,
  META_LAST_DISCOVERY_ERROR,
  META_LAST_POLL_AT,
  META_LAST_POLL_ERROR,
} from "@komodo/store";

import { getStore } from "@/lib/data/server";

export interface OwnerStatus {
  owner: string;
  /** Repositories this deployment knows of, and how many are being polled. */
  repos: number;
  enabled: number;
}

export interface GithubStatus {
  connected: boolean;
  /** The account the token acts as, once GitHub has confirmed it. */
  login: string | null;
  name: string | null;
  /** Where the credential came from, in the words the README uses. */
  source: "GITHUB_TOKEN" | "GH_TOKEN" | "gh CLI" | null;
  /** Why the connection could not be confirmed, if it could not. */
  error: string | null;
}

export interface DeploymentStatus {
  github: GithubStatus;
  owners: OwnerStatus[];
  /** Epoch ms of the last completed poll pass, or null before the first. */
  lastPollAt: number | null;
  lastPollError: string | null;
  lastDiscoveryAt: number | null;
  /** Owners the last listing could not read, if it could not read them all. */
  lastDiscoveryError: string | null;
}

function tokenSource(): GithubStatus["source"] {
  if (process.env.GITHUB_TOKEN) return "GITHUB_TOKEN";
  if (process.env.GH_TOKEN) return "GH_TOKEN";
  return "gh CLI";
}

export async function loadDeploymentStatus(): Promise<DeploymentStatus> {
  const store = await getStore();
  const [{ repositories }, pollAt, pollError, discoveryAt, discoveryError] =
    await Promise.all([
      store.snapshot(),
      store.getMeta(META_LAST_POLL_AT),
      store.getMeta(META_LAST_POLL_ERROR),
      store.getMeta(META_LAST_DISCOVERY_AT),
      store.getMeta(META_LAST_DISCOVERY_ERROR),
    ]);

  const byOwner = new Map<string, OwnerStatus>();
  for (const repo of repositories) {
    const row = byOwner.get(repo.owner) ?? { owner: repo.owner, repos: 0, enabled: 0 };
    row.repos++;
    if (repo.enabled) row.enabled++;
    byOwner.set(repo.owner, row);
  }

  return {
    github: await githubStatus(),
    owners: [...byOwner.values()].sort((a, b) => a.owner.localeCompare(b.owner)),
    lastPollAt: pollAt ? Number(pollAt) : null,
    lastPollError: pollError || null,
    lastDiscoveryAt: discoveryAt ? Number(discoveryAt) : null,
    lastDiscoveryError: discoveryError || null,
  };
}

/**
 * Whether the token works, asked of GitHub rather than assumed.
 *
 * One request against `/user`. A token that exists and a token that is still
 * valid are different states, and the second is the one worth showing on a
 * screen someone opens because reviews stopped arriving.
 */
async function githubStatus(): Promise<GithubStatus> {
  let token: string;
  try {
    token = resolveGithubToken();
  } catch (err) {
    return {
      connected: false,
      login: null,
      name: null,
      source: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  try {
    const viewer = await new GitHubClient(token).getViewer();
    return {
      connected: true,
      login: viewer.login,
      name: viewer.name,
      source: tokenSource(),
      error: null,
    };
  } catch (err) {
    return {
      connected: false,
      login: null,
      name: null,
      source: tokenSource(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
