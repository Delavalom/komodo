import picomatch from "picomatch";

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
