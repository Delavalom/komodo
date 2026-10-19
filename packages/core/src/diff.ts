import { createHash } from "node:crypto";
import picomatch from "picomatch";
import { MAX_LISTED_FILES, type PRFile } from "./github.js";

/**
 * Parse a GitHub unified diff `patch` string into the set of new-file line
 * numbers that are commentable (added or context lines shown in the diff).
 * GitHub review comments with side=RIGHT must anchor to one of these.
 */
export function commentableLines(patch: string): { right: Set<number>; added: Set<number> } {
  const right = new Set<number>();
  const added = new Set<number>();
  let newLine = 0;
  for (const line of patch.split("\n")) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      newLine = parseInt(hunk[1], 10);
      continue;
    }
    if (line.startsWith("+")) {
      right.add(newLine);
      added.add(newLine);
      newLine++;
    } else if (line.startsWith("-") || line.startsWith("\\")) {
      // deletion or "\ No newline" — new-file line number does not advance
    } else {
      // context line
      right.add(newLine);
      newLine++;
    }
  }
  return { right, added };
}

/**
 * Annotate a patch with new-file line numbers so an LLM can cite exact lines.
 * Added/context lines get their RIGHT-side number; deletions get a blank gutter.
 */
export function annotatePatch(patch: string): string {
  const out: string[] = [];
  let newLine = 0;
  for (const line of patch.split("\n")) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      newLine = parseInt(hunk[1], 10);
      out.push(line);
      continue;
    }
    if (line.startsWith("+")) {
      out.push(`${String(newLine).padStart(5)} ${line}`);
      newLine++;
    } else if (line.startsWith("-") || line.startsWith("\\")) {
      out.push(`      ${line}`);
    } else {
      out.push(`${String(newLine).padStart(5)} ${line}`);
      newLine++;
    }
  }
  return out.join("\n");
}

/** Apply include/exclude globs ("!"-prefixed = exclude). A path is kept if it
 * matches no exclude; when any positive globs exist it must also match one. */
export function filterPaths(paths: string[], filters: string[]): string[] {
  const includes = filters.filter((f) => !f.startsWith("!"));
  const excludes = filters.filter((f) => f.startsWith("!")).map((f) => f.slice(1));
  const isExcluded = excludes.length ? picomatch(excludes, { dot: true }) : () => false;
  const isIncluded = includes.length ? picomatch(includes, { dot: true }) : () => true;
  return paths.filter((p) => !isExcluded(p) && isIncluded(p));
}

/**
 * What a pull request changes, independent of where its base is.
 *
 * Two heads with the same fingerprint carry the same change: a rebase that
 * moved the base and touched nothing of the author's own. That is what lets a
 * review and the evidence recorded against it follow the change to its new
 * head instead of starting over (see the store's `carryReview`).
 *
 * Close to `git patch-id --stable`, from what GitHub's file listing gives:
 * each file's path, status and patch, sorted by path, with every `@@` line
 * dropped — line numbers move with the base, and so does the function name
 * GitHub prints after them. Context lines stay: a base that changed within
 * three lines of a hunk changed the code around the edit, and that deserves a
 * fresh read. Indentation stays too, unlike patch-id; in Python and YAML it is
 * the code, and this hash gates an approval.
 *
 * Null when it cannot vouch for the whole change: no files, a file GitHub sent
 * no patch for (binary, or too large), or a listing that hit its cap.
 */
export function changeFingerprint(files: PRFile[]): string | null {
  if (files.length === 0 || files.length >= MAX_LISTED_FILES) return null;
  if (files.some((f) => f.patch === undefined)) return null;

  const hash = createHash("sha256");
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    const body = file
      .patch!.split("\n")
      .filter((line) => !line.startsWith("@@"))
      .map((line) => line.replace(/\r$/, "").trimEnd())
      .join("\n");
    hash.update(`${file.path}\0${file.status}\0${body}\0`);
  }
  return hash.digest("hex");
}
