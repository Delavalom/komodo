/**
 * When a pass looks for new repositories.
 *
 * Discovery used to run on every pass, unconditionally. Against a 735-repository
 * organisation that was eight pages of REST every minute, and 735 rows in Manage
 * Repositories nobody had asked for — so the question these tests pin down is
 * not what discovery writes (see discover.test.ts) but whether it runs at all.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { KomodoConfigSchema, type GitHubClient } from "@komodo/core";
import { META_DISCOVERY_REQUESTED_AT } from "@komodo/store";
import { SqliteStore } from "@komodo/store/sqlite";

import { ingestOnce } from "../src/loop.js";

function fakeGitHub() {
  const calls = { owners: 0, list: 0 };
  const client = {
    async listOwnerRepos(owner: string) {
      calls.owners++;
      return [
        { owner, name: "api", archived: false, isPrivate: false },
        { owner, name: "www", archived: false, isPrivate: false },
      ];
    },
    async listOpenPRs() {
      calls.list++;
      return [];
    },
  } as unknown as GitHubClient;
  return { client, calls };
}

describe("ingestOnce discovery", () => {
  let store: SqliteStore;

  beforeEach(async () => {
    store = new SqliteStore({ path: ":memory:" });
    await store.upsertRepository({
      id: "acme/api", owner: "acme", name: "api",
      provider: "github", enabled: true, reviewCount: 0,
    });
  });

  const pass = async (github: GitHubClient) =>
    ingestOnce({ store, github, config: KomodoConfigSchema.parse({}) });

  it("polls without listing an owner nobody asked it to list", async () => {
    const { client, calls } = fakeGitHub();

    await pass(client);

    expect(calls.list).toBe(1);
    expect(calls.owners).toBe(0);
    expect((await store.snapshot()).repositories).toHaveLength(1);
  });

  it("lists when someone presses Rescan, and once per press", async () => {
    const { client, calls } = fakeGitHub();
    await store.setMeta(META_DISCOVERY_REQUESTED_AT, String(Date.now()));

    await pass(client);
    expect(calls.owners).toBe(1);
    expect((await store.snapshot()).repositories).toHaveLength(2);

    // The request is served, so the next pass is quiet again — a rescan that
    // replayed itself every minute would be the behaviour this replaced.
    await pass(client);
    expect(calls.owners).toBe(1);
  });

  it("keeps looking for a team that wants new repositories enabled", async () => {
    const { client, calls } = fakeGitHub();
    await store.saveSettings({ autoEnableNewRepos: true });

    await pass(client);

    expect(calls.owners).toBe(1);
    const { repositories } = await store.snapshot();
    expect(repositories.find((r) => r.id === "acme/www")!.enabled).toBe(true);
  });
});
