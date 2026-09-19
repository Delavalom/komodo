import { describe, expect, it } from "vitest";
import type { ResolvedContextSource } from "@komodo/core";
import { META_CONTEXT_SOURCES } from "@komodo/store";
import { SqliteStore } from "@komodo/store/sqlite";
import { recordContextSources, toSharedContextRecord } from "../src/context-sync.js";

const resolved: ResolvedContextSource[] = [
  {
    source: { type: "path", path: "../rules", ignore: [], repos: [], clusters: [] },
    name: "Rules",
    root: "/abs/rules",
    ok: true,
    files: [
      {
        path: "a.md",
        label: "Rules/a.md",
        description: "How to review",
        scope: { repos: ["acme/api"], clusters: [], globs: [] },
        text: "Secret file contents nobody should see in the record.",
        chars: 55,
        truncated: false,
        warning: undefined,
      },
    ],
  },
  {
    source: { type: "path", path: "../missing", ignore: [], repos: [], clusters: [] },
    name: "Missing",
    root: "/abs/missing",
    ok: false,
    error: "directory not found",
    files: [],
  },
];

describe("toSharedContextRecord", () => {
  it("carries scope and size but never file text", () => {
    const record = toSharedContextRecord(resolved, 1_000);
    expect(record.version).toBe(1);
    expect(record.resolvedAt).toBe(1_000);
    expect(record.sources).toHaveLength(2);
    expect(record.sources[0].files[0]).toMatchObject({
      path: "a.md",
      label: "Rules/a.md",
      description: "How to review",
      repos: ["acme/api"],
      chars: 55,
    });
    expect(JSON.stringify(record)).not.toContain("Secret file contents");
  });

  it("records why a source failed", () => {
    const record = toSharedContextRecord(resolved);
    expect(record.sources[1]).toMatchObject({ ok: false, error: "directory not found", files: [] });
  });
});

describe("recordContextSources", () => {
  it("round-trips through the store's meta key", async () => {
    const store = new SqliteStore({ path: ":memory:" });
    await recordContextSources(store, resolved, 2_000);

    const raw = await store.getMeta(META_CONTEXT_SOURCES);
    expect(raw).toBeTruthy();
    const record = JSON.parse(raw!);
    expect(record.resolvedAt).toBe(2_000);
    expect(record.sources).toHaveLength(2);
    store.close();
  });

  it("does not throw when the store write fails", async () => {
    const store = new SqliteStore({ path: ":memory:" });
    store.close(); // closed store makes setMeta fail
    await expect(recordContextSources(store, resolved)).resolves.toBeUndefined();
  });
});
