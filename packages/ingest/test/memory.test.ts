/**
 * Which rules reach the reviewer.
 *
 * The failure this guards against is the one the memory screens shipped with:
 * rules that can be written and scoped and counted, and are never read. These
 * tests are the record of what a scope actually means.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import type { MemoryRule, RepoCluster } from "@komodo/store";

import { selectMemories } from "../src/memory.js";

const rule = (over: Partial<MemoryRule> = {}): MemoryRule => ({
  id: "mem_1",
  description: "Currency amounts must be integer minor units",
  kind: "rule",
  pattern: "Use amountCents, never a float",
  repoId: null,
  fileGlob: "",
  status: "active",
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

const select = (
  rules: MemoryRule[],
  over: Partial<Parameters<typeof selectMemories>[0]> = {},
) =>
  selectMemories({
    rules,
    clusters: [],
    repoId: "acme/api",
    changedPaths: ["src/billing.ts"],
    ...over,
  });

describe("selectMemories", () => {
  it("applies an unscoped rule everywhere", () => {
    const { memories, uses } = select([rule()]);
    expect(memories).toEqual([
      {
        text: "Use amountCents, never a float",
        label: "Currency amounts must be integer minor units",
      },
    ]);
    expect(uses).toEqual([{ ruleId: "mem_1", paths: [] }]);
  });

  it("skips an inactive rule", () => {
    expect(select([rule({ status: "inactive" })]).memories).toHaveLength(0);
  });

  it("honours a repository scope", () => {
    expect(select([rule({ repoId: "acme/api" })]).memories).toHaveLength(1);
    expect(select([rule({ repoId: "acme/web" })]).memories).toHaveLength(0);
  });

  it("resolves a scope that names a cluster", () => {
    const clusters: RepoCluster[] = [
      { id: "cluster_1", name: "Mobile", memberRepoIds: ["acme/api"], createdAt: 0 },
    ];
    expect(select([rule({ repoId: "cluster_1" })], { clusters }).memories)
      .toHaveLength(1);

    const elsewhere: RepoCluster[] = [
      { id: "cluster_1", name: "Mobile", memberRepoIds: ["acme/ios"], createdAt: 0 },
    ];
    expect(select([rule({ repoId: "cluster_1" })], { clusters: elsewhere }).memories)
      .toHaveLength(0);
  });

  it("applies a file-scoped rule only when the change touches a match", () => {
    const scoped = rule({ fileGlob: "src/**/*.ts" });
    expect(select([scoped]).memories).toHaveLength(1);
    expect(select([scoped], { changedPaths: ["README.md"] }).memories)
      .toHaveLength(0);
  });

  it("treats an empty glob as every file rather than no file", () => {
    expect(select([rule({ fileGlob: "   " })]).memories).toHaveLength(1);
  });

  it("skips a rule whose text is blank", () => {
    expect(select([rule({ pattern: "  " })]).memories).toHaveLength(0);
  });

  describe("file rules", () => {
    const dirs: string[] = [];
    const tree = (files: Record<string, string>) => {
      const dir = mkdtempSync(join(tmpdir(), "komodo-memory-"));
      dirs.push(dir);
      for (const [path, body] of Object.entries(files)) {
        const full = join(dir, path);
        mkdirSync(join(full, ".."), { recursive: true });
        writeFileSync(full, body);
      }
      return dir;
    };
    afterEach(() => {
      while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
    });

    const fileRule = (pattern: string) =>
      rule({ kind: "file", pattern, description: "Agent files" });

    it("reads the file out of the checkout", () => {
      const repoDir = tree({ "AGENTS.md": "# Rules\nNever use floats for money." });
      const { memories, uses } = select([fileRule("AGENTS.md")], { repoDir });

      expect(memories).toHaveLength(1);
      expect(memories[0].text).toContain("Never use floats for money.");
      // Labelled by path, so a judgement can cite where the rule came from.
      expect(memories[0].label).toBe("AGENTS.md");
      // The paths travel with the use, so the knowledge-base screen can show
      // what was actually read rather than the glob that found it.
      expect(uses).toEqual([{ ruleId: "mem_1", paths: ["AGENTS.md"] }]);
    });

    it("matches a glob across the known context files", () => {
      const repoDir = tree({
        "CLAUDE.md": "Claude conventions.",
        "AGENTS.md": "Agent conventions.",
      });
      const { memories } = select([fileRule("{CLAUDE.md,AGENTS.md}")], { repoDir });
      expect(memories.map((m) => m.label).sort()).toEqual(["AGENTS.md", "CLAUDE.md"]);
    });

    it("contributes nothing when the file is absent", () => {
      const repoDir = tree({ "README.md": "nothing here" });
      expect(select([fileRule("AGENTS.md")], { repoDir }).memories).toHaveLength(0);
    });

    it("contributes nothing without a checkout", () => {
      // Diff-only reviews are valid; there is simply no tree to read.
      expect(select([fileRule("AGENTS.md")]).memories).toHaveLength(0);
    });

    it("refuses a pattern that tries to escape the checkout", () => {
      const repoDir = tree({ "AGENTS.md": "in the tree" });
      // The glob comes from a text field, and this is the one place a
      // user-supplied string becomes a filesystem path.
      expect(select([fileRule("../../../etc/passwd")], { repoDir }).memories)
        .toHaveLength(0);
    });

    it("truncates a very large file rather than flooding the prompt", () => {
      const repoDir = tree({ "AGENTS.md": "x".repeat(20_000) });
      const [memory] = select([fileRule("AGENTS.md")], { repoDir }).memories;
      expect(memory.text.length).toBeLessThan(9_000);
      expect(memory.text).toContain("truncated");
    });

    it("ignores an empty file", () => {
      const repoDir = tree({ "AGENTS.md": "   \n  " });
      expect(select([fileRule("AGENTS.md")], { repoDir }).memories).toHaveLength(0);
    });
  });
});
