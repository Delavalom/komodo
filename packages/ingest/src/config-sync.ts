/**
 * komodo.yaml is the source of truth for who the team is.
 *
 * Editing the file and restarting has to be enough to change the roster —
 * that is the whole self-hosted story. So this runs on every boot and makes
 * the store match the config, rather than treating the database as the record
 * and the file as a one-time import.
 */
import type { KomodoConfig } from "@komodo/core";
import type { KomodoStore } from "@komodo/store";

export interface TeamSyncResult {
  teamId: string | null;
  slug?: string;
  members: number;
  repositories: number;
}

const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "team";

export async function applyTeamConfig(
  store: KomodoStore,
  config: KomodoConfig,
): Promise<TeamSyncResult> {
  const { members, repos, name, you } = config.team;
  if (members.length === 0 && repos.length === 0) {
    return { teamId: null, members: 0, repositories: 0 };
  }

  // Without this the store falls back to its placeholder organization and
  // every URL 404s, because the slug in the address bar matches nothing.
  await store.setOrganization({
    slug: config.team.slug ?? slugify(name),
    name,
    role: "admin",
    trialEndsAt: 0,
    plan: "pro",
  });

  const repoIds: string[] = [];
  for (const full of repos) {
    const [owner, repo] = full.split("/");
    if (!owner || !repo) continue;
    repoIds.push(
      await store.upsertRepository({
        id: full,
        owner,
        name: repo,
        provider: "github",
        enabled: true,
        reviewCount: 0,
      }),
    );
  }

  const memberIds: string[] = [];
  for (const login of members) {
    memberIds.push(
      await store.saveMember({
        id: `member_${login.toLowerCase()}`,
        email: `${login}@users.noreply.github.com`,
        name: login,
        githubLogin: login,
        role: login === you ? "admin" : "member",
        avatarSeed: login,
        isYou: login === you,
      }),
    );
  }

  const teamId = await store.saveTeam({
    id: "team_config",
    name,
    memberIds,
    watchedRepoIds: repoIds,
  });

  return {
    teamId,
    slug: config.team.slug ?? slugify(name),
    members: memberIds.length,
    repositories: repoIds.length,
  };
}
