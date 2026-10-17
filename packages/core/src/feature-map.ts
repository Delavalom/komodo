/**
 * A repository's feature map: what a user can do, where, and what they see.
 *
 * Komodo's verification checks tell a person how to exercise a change. Written
 * from the diff alone, the steps are a guess — a route name or a button label
 * the model never saw is easy to invent, and a check nobody can follow is
 * worse than none. A feature map is the repository's own answer to "how do I
 * reach this", kept next to the code, so the checks can quote it.
 *
 * It is a convention rather than a setting: one of a few fixed paths, the
 * first that exists wins. A configurable path would need a control and a
 * field (AGENTS.md rule 3) for something nobody has asked to move.
 *
 * Lives in core because all three review paths need it — the server reviewer,
 * `komodo pr` and `komodo prompt` — and only core reaches all three.
 */
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** Where a feature map is looked for, in order. The first readable one wins. */
export const FEATURE_MAP_PATHS = ["docs/feature-map.md", "FEATURES.md", ".github/feature-map.md"] as const;

/** Same cap as a memory file: a prompt that is mostly one document stops being about the diff. */
export const MAX_FEATURE_MAP_CHARS = 8_000;

export interface FeatureMap {
  /** Repository-relative path it was read from. */
  path: string;
  /** Trimmed contents, truncated at MAX_FEATURE_MAP_CHARS. */
  text: string;
  truncated: boolean;
}

/**
 * Reads the first feature map in the checkout. Never throws: no map, an
 * unreadable one, or one reached through a symlink that leaves the checkout
 * all read as "no map", which is a weaker review and not a broken one.
 *
 * The paths are constants, not user input, but a committed symlink is still
 * the pull request author's to point anywhere — so every candidate is
 * resolved and refused when it lands outside the tree, the same check
 * packages/ingest/src/memory.ts applies to a settings glob.
 */
export function readFeatureMap(repoDir: string): FeatureMap | null {
  let root: string;
  try {
    root = realpathSync(/*turbopackIgnore: true*/ repoDir);
  } catch {
    return null;
  }

  for (const path of FEATURE_MAP_PATHS) {
    let real: string;
    try {
      real = realpathSync(/*turbopackIgnore: true*/ join(root, path));
    } catch {
      continue;
    }
    const rel = relative(root, real);
    if (rel === "" || rel.startsWith("..") || rel.startsWith(sep)) continue;

    let raw: string;
    try {
      if (!lstatSync(/*turbopackIgnore: true*/ real).isFile()) continue;
      raw = readFileSync(/*turbopackIgnore: true*/ real, "utf8");
    } catch {
      continue;
    }
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const truncated = trimmed.length > MAX_FEATURE_MAP_CHARS;
    return {
      path,
      text: truncated ? `${trimmed.slice(0, MAX_FEATURE_MAP_CHARS)}\n…(truncated)` : trimmed,
      truncated,
    };
  }
  return null;
}
