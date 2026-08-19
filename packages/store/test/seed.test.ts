import { describe, expect, it } from "vitest";

import { seedStore } from "../src/seed.js";
import { SqliteStore } from "../src/sqlite.js";

async function seeded() {
  const store = new SqliteStore({ path: ":memory:" });
  await seedStore(store, { you: "Delavalom" });
  return store;
}

describe("seedStore", () => {
  it("gives komodo dev a queue to render before any token is configured", async () => {
    const store = await seeded();
    const { judgments, repositories, members, teams } = await store.snapshot();

    expect(repositories.length).toBeGreaterThan(0);
    expect(judgments).toHaveLength(184);
    expect(teams).toHaveLength(1);
    expect(teams[0].memberIds).toHaveLength(members.length);
    expect([...teams[0].watchedRepoIds].sort()).toEqual(
      repositories.map((r) => r.id).sort(),
    );
    store.close();
  });

  it("leaves open pull requests waiting on a named reviewer", async () => {
    const store = await seeded();
    const { judgments } = await store.snapshot();

    const open = judgments.filter((j) => j.state === "open");
    expect(open.length).toBeGreaterThan(10);
    expect(open.every((j) => !j.requestedReviewers.includes(j.author))).toBe(true);
    expect(open.some((j) => j.requestedReviewers.length > 0)).toBe(true);
    store.close();
  });

  it("marks exactly one member as the signed-in user", async () => {
    const store = await seeded();
    const { members } = await store.snapshot();
    expect(members.filter((m) => m.isYou)).toHaveLength(1);
    expect(members.find((m) => m.isYou)?.githubLogin).toBe("Delavalom");
    store.close();
  });

  it("never lets a judgment disagree with its own score", async () => {
    const store = await seeded();
    const { judgments } = await store.snapshot();

    for (const j of judgments) {
      if (j.status !== "completed") expect(j.verdict).toBeNull();
      else if (j.score >= 5) expect(j.verdict).toBe("ship");
      else if (j.score < 2) expect(j.verdict).toBe("blocked");
    }
    store.close();
  });

  it("is idempotent — re-seeding updates in place rather than doubling", async () => {
    const store = new SqliteStore({ path: ":memory:" });
    await seedStore(store);
    await seedStore(store);

    const { judgments, repositories, members } = await store.snapshot();
    expect(judgments).toHaveLength(184);
    expect(repositories).toHaveLength(15);
    expect(members).toHaveLength(6);
    store.close();
  });
});
