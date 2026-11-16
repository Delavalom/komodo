import { effectivePathFilters, KomodoConfigSchema, type KomodoConfig } from "../config.js";
import { filterPaths } from "../diff.js";
import { LocalGitDiffSource } from "../diff-sources/local-git.js";
import type { AacrInstance } from "./types.js";

export interface InstancePreview {
  files: number;
  /** Files left after Komodo's path filters — what its reviewer would read. */
  reviewable: number;
  additions: number;
  deletions: number;
  /** References on files the path filters removed: issues Komodo cannot raise. */
  referencesOnFilteredFiles: number;
}

/**
 * The diff Komodo's reviewer would be handed for one instance, built from the
 * prepared checkout with no model call — what `--preview` prints.
 */
export async function previewInstance(
  instance: AacrInstance,
  repoPath: string,
  config: KomodoConfig = KomodoConfigSchema.parse({}),
): Promise<InstancePreview> {
  const source = new LocalGitDiffSource(repoPath, instance.baseCommit, instance.headCommit);
  const files = await source.getFiles();
  const kept = new Set(filterPaths(files.map((f) => f.path), effectivePathFilters(config)));
  const reviewable = files.filter((f) => kept.has(f.path));
  return {
    files: files.length,
    reviewable: reviewable.length,
    additions: reviewable.reduce((a, f) => a + f.additions, 0),
    deletions: reviewable.reduce((a, f) => a + f.deletions, 0),
    referencesOnFilteredFiles: instance.references.filter((r) => !kept.has(r.path)).length,
  };
}
