import { beforeEach, describe, expect, it } from "vitest";

import { SqliteStore } from "@komodo/store/sqlite";
import {
  META_LAST_DISCOVERY_AT,
  META_LAST_DISCOVERY_ERROR,
} from "@komodo/store";
import type { GitHubClient, RepoListItem } from "@komodo/core";

import { discoverRepositories } from "../src/discover.js";

function fakeGitHub(byOwner: Record<string, Partial<RepoListItem>[]>) {
  const calls: string[] = [];
  const client = {
    async listOwnerRepos(owner: string) {
      calls.push(owner);
      const listing = byOwner[owner];
      if (!listing) throw new Error(`GitHub knows no user or organisation called ${owner}.`);
      return listing.map((r) => ({
        owner,
        name: "unnamed",
        archived: false,
        isPrivate: false,
        ...r,
      }));
    },
  } as unknown as GitHubClient;
  return { client, calls };
}

describe("discoverRepositories", () => {
  let store: SqliteStore;

  beforeEach(async () => {
    store = new SqliteStore({ path: ":memory:" });
    await store.upsertRepository({
      id: "acme/api", owner: "acme", name: "api",
      provider: "github", enabled: true, reviewCount: 0,
    });
  });

  it("writes the repositories an owner has that the store has never seen", async () => {
    const { client } = fakeGitHub({ acme: [{ name: "api" }, { name: "www" }] });

    const result = await discoverRepositories({
      store, github: client, autoEnable: false,
    });

    expect(result).toEqual({ owners: 1, added: 1, failed: [] });
    const { repositories } = await store.snapshot();
    expect(repositories.map((r) => r.id).sort()).toEqual(["acme/api", "acme/www"]);
  });

  it("starts a new repository disabled, or enabled, as the setting says", async () => {
    const off = fakeGitHub({ acme: [{ name: "www" }] });
    await discoverRepositories({ store, github: off.client, autoEnable: false });
    let repos = (await store.snapshot()).repositories;
    expect(repos.find((r) => r.id === "acme/www")!.enabled).toBe(false);

    store = new SqliteStore({ path: ":memory:" });
    await store.upsertRepository({
      id: "acme/api", owner: "acme", name: "api",
      provider: "github", enabled: true, reviewCount: 0,
    });
    const on = fakeGitHub({ acme: [{ name: "www" }] });
    await discoverRepositories({ store, github: on.client, autoEnable: true });
    repos = (await store.snapshot()).repositories;
    expect(repos.find((r) => r.id === "acme/www")!.enabled).toBe(true);
  });

  it("never rewrites a repository the store already holds", async () => {
    // The screen's toggle would otherwise be undone by the next pass.
    await store.setRepoEnabled("acme/api", false);
    const { client } = fakeGitHub({ acme: [{ name: "api" }] });

    await discoverRepositories({
      store, github: client, autoEnable: true, force: true,
    });

    const repos = (await store.snapshot()).repositories;
    expect(repos.find((r) => r.id === "acme/api")!.enabled).toBe(false);
  });

  it("skips archived repositories — they take no more pull requests", async () => {
    const { client } = fakeGitHub({
      acme: [{ name: "old", archived: true }, { name: "www" }],
    });

    await discoverRepositories({ store, github: client, autoEnable: true });

    const ids = (await store.snapshot()).repositories.map((r) => r.id);
    expect(ids).not.toContain("acme/old");
    expect(ids).toContain("acme/www");
  });

  it("lists only owners the store already knows about", async () => {
    const { client, calls } = fakeGitHub({
      acme: [{ name: "www" }],
      other: [{ name: "thing" }],
    });

    await discoverRepositories({ store, github: client, autoEnable: false });

    expect(calls).toEqual(["acme"]);
  });

  it("holds off until the interval has elapsed, and runs anyway when forced", async () => {
    const first = fakeGitHub({ acme: [{ name: "www" }] });
    await discoverRepositories({ store, github: first.client, autoEnable: false });
    expect(await store.getMeta(META_LAST_DISCOVERY_AT)).toBeTruthy();

    const second = fakeGitHub({ acme: [{ name: "other" }] });
    const skipped = await discoverRepositories({
      store, github: second.client, autoEnable: false,
    });
    expect(skipped).toEqual({ owners: 0, added: 0, failed: [] });
    expect(second.calls).toEqual([]);

    const forced = await discoverRepositories({
      store, github: second.client, autoEnable: false, force: true,
    });
    expect(forced.added).toBe(1);
  });

  it("survives an owner the token has lost access to", async () => {
    await store.upsertRepository({
      id: "gone/repo", owner: "gone", name: "repo",
      provider: "github", enabled: true, reviewCount: 0,
    });
    const { client } = fakeGitHub({ acme: [{ name: "www" }] });
    const notes: string[] = [];

    const result = await discoverRepositories({
      store, github: client, autoEnable: false, onProgress: (m) => notes.push(m),
    });

    expect(result.added).toBe(1);
    expect(notes.some((n) => n.includes("gone"))).toBe(true);
  });

  it("writes down the owner it could not read, and clears it once it can", async () => {
    // A partial pass still spends the Rescan that asked for it, so the owner it
    // missed has to be on the record rather than only in the ingester's log.
    await store.upsertRepository({
      id: "gone/repo", owner: "gone", name: "repo",
      provider: "github", enabled: true, reviewCount: 0,
    });
    const partial = fakeGitHub({ acme: [{ name: "www" }] });

    const result = await discoverRepositories({
      store, github: partial.client, autoEnable: false,
    });

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toMatch(/^gone \(/);
    expect(await store.getMeta(META_LAST_DISCOVERY_ERROR)).toContain("gone");

    const whole = fakeGitHub({ acme: [{ name: "www" }], gone: [{ name: "repo" }] });
    await discoverRepositories({
      store, github: whole.client, autoEnable: false, force: true,
    });

    expect(await store.getMeta(META_LAST_DISCOVERY_ERROR)).toBe("");
  });
});
