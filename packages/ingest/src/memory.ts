/**
 * Choosing which of a team's rules apply to this pull request.
 *
 * The memory screens were a filing cabinet with no door: rules could be
 * written, scoped and counted, and nothing ever read one. This is the door.
 *
 * Two independent narrowings, and a rule has to survive both:
 *
 *   - **Repository.** A rule scoped to a repository, or to a cluster
 *     containing one, applies only there. An unscoped rule applies everywhere,
 *     which is the common case and a deliberate one.
 *   - **Files.** A rule with a `fileGlob` applies only when the pull request
 *     actually touches a matching file. Handing a reviewer a rule about
 *     migrations while it reads a CSS change is how a prompt stops being read.
 *
 * A `file` rule carries no text of its own: its pattern names paths in the
 * repository — CLAUDE.md, AGENTS.md, .cursorrules — whose contents are read
 * off the working tree the reviewer already has. That is what makes the
 * knowledge base a real thing rather than a screen: the conventions a team has
 * already written down do not have to be typed in twice.
 */
import { readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

import { filterPaths, type ReviewMemory } from "@komodo/core";
import type { MemoryRule, RepoCluster } from "@komodo/store";

/**
 * Cap on one file's contribution.
 *
 * A repository can contain a very large AGENTS.md, and a prompt that is mostly
 * one file's conventions is a prompt that has stopped being about the diff.
 */
const MAX_FILE_CHARS = 8_000;

export interface SelectMemoriesInput {
  rules: MemoryRule[];
  clusters: RepoCluster[];
  /** The repository under review, `owner/name`. */
  repoId: string;
  /** Paths the pull request touches. */
  changedPaths: string[];
  /** Working tree at the head, when the reviewer got one. */
  repoDir?: string;
  onProgress?: (msg: string) => void;
}

export interface SelectedMemories {
  memories: ReviewMemory[];
  /**
   * The rules that contributed, and for a file rule the paths it resolved to.
   *
   * The paths go into the usage ledger because the web server has no checkout
   * and so cannot answer "which files does this rule match" for itself — the
   * knowledge-base screen is built from what the reviewer actually read.
   */
  uses: { ruleId: string; paths: string[] }[];
}

/** Rules whose scope matches this pull request, resolved into prompt text. */
export function selectMemories(input: SelectMemoriesInput): SelectedMemories {
  const { rules, clusters, repoId, changedPaths, repoDir } = input;

  const clustersFor = new Set(
    clusters
      .filter((c) => c.memberRepoIds.includes(repoId))
      .map((c) => c.id),
  );

  const memories: ReviewMemory[] = [];
  const uses: { ruleId: string; paths: string[] }[] = [];

  for (const rule of rules) {
    if (rule.status !== "active") continue;
    if (!appliesToRepo(rule, repoId, clustersFor)) continue;
    if (!appliesToFiles(rule, changedPaths)) continue;

    if (rule.kind === "rule") {
      const text = rule.pattern.trim();
      if (!text) continue;
      memories.push({ text, label: rule.description || "Team rule" });
      uses.push({ ruleId: rule.id, paths: [] });
      continue;
    }

    // A file rule resolves against the checkout. Without one the reviewer is
    // working from the diff alone and there is nothing to read, which is a
    // weaker review but not a broken one.
    if (!repoDir) continue;
    const files = readMatchingFiles(repoDir, rule.pattern, input.onProgress);
    if (!files.length) continue;
    for (const file of files) {
      memories.push({ text: file.text, label: file.path });
    }
    uses.push({ ruleId: rule.id, paths: files.map((f) => f.path) });
  }

  return { memories, uses };
}

/**
 * A rule scoped to a repository applies there and nowhere else. Scoped to a
 * cluster's repository, the same. Unscoped, everywhere.
 */
function appliesToRepo(
  rule: MemoryRule,
  repoId: string,
  clusterIds: Set<string>,
): boolean {
  if (!rule.repoId) return true;
  if (rule.repoId === repoId) return true;
  // The scope may name a cluster rather than a repository — the screen offers
  // both in one field, and the ids do not collide.
  return clusterIds.has(rule.repoId);
}

/** No glob means every file; a glob means the change has to touch one. */
function appliesToFiles(rule: MemoryRule, changedPaths: string[]): boolean {
  const glob = rule.fileGlob.trim();
  if (!glob) return true;
  return filterPaths(changedPaths, [glob]).length > 0;
}

/**
 * Reads the files a `file` rule points at, out of the working tree.
 *
 * Every path is re-resolved and checked to be inside the checkout before it is
 * opened. The glob comes from a text field on a settings screen, and a pattern
 * that escapes the tree would otherwise read whatever the server can — this is
 * the one place in the ingester where a user-supplied string becomes a
 * filesystem path.
 */
function readMatchingFiles(
  repoDir: string,
  glob: string,
  onProgress?: (msg: string) => void,
): { path: string; text: string }[] {
  const root = resolve(repoDir);
  // Deliberately not a directory walk: a glob against a whole repository is
  // slow and the conventions files worth reading live at known-ish paths.
  // filterPaths does the matching, so the same picomatch semantics as
  // path_filters apply here.
  const candidates = filterPaths(KNOWN_CONTEXT_FILES, [glob]);

  const out: { path: string; text: string }[] = [];
  for (const candidate of candidates) {
    const full = resolve(join(root, candidate));
    // Outside the tree, or reached by traversal — refuse rather than read.
    const rel = relative(root, full);
    if (rel.startsWith("..") || rel.startsWith(sep) || rel === "") continue;

    try {
      if (!statSync(full).isFile()) continue;
      const text = readFileSync(full, "utf8").trim();
      if (!text) continue;
      out.push({
        path: candidate,
        text:
          text.length > MAX_FILE_CHARS
            ? `${text.slice(0, MAX_FILE_CHARS)}\n…(truncated)`
            : text,
      });
    } catch {
      // Absent is the normal case — most repositories have none of these.
      continue;
    }
  }

  if (candidates.length && !out.length) {
    onProgress?.(`  no context files matched ${glob} in the checkout.`);
  }
  return out;
}

/**
 * Where conventions are actually written down.
 *
 * An explicit list rather than a recursive walk: these are the files the
 * ecosystem has settled on, the memory screen offers exactly these as presets,
 * and walking a repository to find them costs more than it returns.
 */
const KNOWN_CONTEXT_FILES = [
  "CLAUDE.md",
  "Claude.md",
  "claude.md",
  "AGENTS.md",
  "Agents.md",
  "agents.md",
  ".cursorrules",
  ".cursor/rules/project.mdc",
  "CONTRIBUTING.md",
  "docs/CONVENTIONS.md",
  ".github/CONTRIBUTING.md",
];
