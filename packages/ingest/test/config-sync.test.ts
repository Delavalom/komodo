import { describe, expect, it } from "vitest";

import { KomodoConfigSchema } from "@komodo/core";
import { SqliteStore } from "@komodo/store/sqlite";

import { applyTeamConfig } from "../src/config-sync.js";

const config = (team: Record<string, unknown>) =>
  KomodoConfigSchema.parse({ team });

describe("applyTeamConfig", () => {
  it("makes the store match komodo.yaml, so editing the file is enough", async () => {
    const store = new SqliteStore({ path: ":memory:" });
    await applyTeamConfig(
      store,
      config({
        name: "Core Infra",
        you: "Delavalom",
        members: ["Delavalom", "mgutierrez"],
        repos: ["Delavalom/komodo"],
      }),
    );

    const { teams, members, repositories, organization } = await store.snapshot();
    expect(teams[0].name).toBe("Core Infra");
    expect(teams[0].watchedRepoIds).toEqual(["Delavalom/komodo"]);
    expect(repositories[0].owner).toBe("Delavalom");
    expect(members.filter((m) => m.isYou)).toHaveLength(1);
    // Without an organization row every URL 404s against the default slug.
    expect(organization.slug).toBe("core-infra");
    store.close();
  });

  it("drops a teammate removed from the file rather than accumulating", async () => {
    const store = new SqliteStore({ path: ":memory:" });
    await applyTeamConfig(store, config({ members: ["a", "b"], repos: [] }));
    await applyTeamConfig(store, config({ members: ["b"], repos: [] }));

    const { teams } = await store.snapshot();
    expect(teams[0].memberIds).toEqual(["member_b"]);
    store.close();
  });

  it("keeps a repository someone switched off on the screen switched off", async () => {
    // The file says which repositories the team cares about; the screen says
    // whether one is being polled right now. A restart must not overrule it.
    const store = new SqliteStore({ path: ":memory:" });
    const team = config({ members: ["a"], repos: ["acme/api"] });
    await applyTeamConfig(store, team);
    await store.setRepoEnabled("acme/api", false);

    await applyTeamConfig(store, team);

    const { repositories } = await store.snapshot();
    expect(repositories.find((r) => r.id === "acme/api")!.enabled).toBe(false);
    store.close();
  });

  it("does nothing when no team is configured, leaving the seed alone", async () => {
    const store = new SqliteStore({ path: ":memory:" });
    const result = await applyTeamConfig(store, config({}));

    expect(result.teamId).toBeNull();
    expect((await store.snapshot()).teams).toHaveLength(0);
    store.close();
  });
});
