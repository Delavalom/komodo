import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { annotatePatch, commentableLines, filterPaths } from "../src/diff.js";

const RUNS = { seed: 20261017, numRuns: 300 };

type Op = "ctx" | "add" | "del";
const text = fc.stringMatching(/^[a-zA-Z0-9 _(){};=]{0,30}$/);
const hunk = fc.record({
  start: fc.integer({ min: 1, max: 5000 }),
  ops: fc.array(fc.tuple(fc.constantFrom<Op>("ctx", "add", "del"), text), { minLength: 1, maxLength: 25 }),
});

/** Build a GitHub-style patch (no file headers) and the line numbers a reviewer may anchor to. */
function build(hunks: { start: number; ops: [Op, string][] }[]) {
  const lines: string[] = [];
  const right = new Set<number>();
  const added = new Set<number>();
  let floor = 1;
  for (const h of hunks) {
    const start = Math.max(h.start, floor);
    const oldLen = h.ops.filter(([o]) => o !== "add").length;
    const newLen = h.ops.filter(([o]) => o !== "del").length;
    lines.push(`@@ -${start},${oldLen} +${start},${newLen} @@`);
    let n = start;
    for (const [op, t] of h.ops) {
      if (op === "del") lines.push(`-${t}`);
      else {
        lines.push(`${op === "add" ? "+" : " "}${t}`);
        right.add(n);
        if (op === "add") added.add(n);
        n++;
      }
    }
    floor = n + 1;
  }
  return { patch: lines.join("\n"), right, added };
}

describe("commentableLines", () => {
  it("matches a reference model of unified-diff numbering", () => {
    fc.assert(
      fc.property(fc.array(hunk, { minLength: 1, maxLength: 4 }), (hs) => {
        const { patch, right, added } = build(hs);
        const got = commentableLines(patch);
        expect([...got.right].sort((a, b) => a - b)).toEqual([...right].sort((a, b) => a - b));
        expect([...got.added].sort((a, b) => a - b)).toEqual([...added].sort((a, b) => a - b));
      }),
      RUNS,
    );
  });

  it("added is always a subset of right, and annotatePatch numbers exactly the right-side lines", () => {
    fc.assert(
      fc.property(fc.array(hunk, { minLength: 1, maxLength: 4 }), (hs) => {
        const { patch } = build(hs);
        const { right, added } = commentableLines(patch);
        for (const n of added) expect(right.has(n)).toBe(true);
        const gutter = annotatePatch(patch)
          .split("\n")
          .map((l) => /^\s*(\d+) /.exec(l)?.[1])
          .filter(Boolean)
          .map(Number);
        expect(new Set(gutter)).toEqual(right);
      }),
      RUNS,
    );
  });

  /*
   * Real bug found by this property (see PR body / Evidence block): a patch
   * ending in "\n" produces a trailing "" element from `.split("\n")`, which
   * falls through to the context-line branch in both `commentableLines` and
   * `annotatePatch` and is counted as one more commentable line past the end
   * of the hunk. A review comment could then anchor to a line GitHub's API
   * would reject.
   *
   * Per 01-standards.md ("pin bugs with an explicit assertion, not
   * it.fails"), this is pinned as the actual current behavior rather than
   * `it.fails`, so the test flips (forcing someone to notice) once the bug is
   * fixed rather than silently keeps passing.
   */
  it("BUG #1: a trailing newline invents one extra commentable line past the hunk", () => {
    const { patch, right } = build([{ start: 10, ops: [["ctx", "a"], ["add", "b"]] }]);
    const phantomLine = Math.max(...right) + 1;
    // TODO(#1): once fixed, this should read:
    //   expect(commentableLines(`${patch}\n`).right).toEqual(right);
    const withTrailingNewline = commentableLines(`${patch}\n`).right;
    expect(withTrailingNewline).not.toEqual(right);
    expect(withTrailingNewline).toEqual(new Set([...right, phantomLine]));
  });
});

describe("filterPaths", () => {
  const seg = fc.stringMatching(/^[a-z0-9_.-]{1,8}$/);
  const path = fc.array(seg, { minLength: 1, maxLength: 4 }).map((s) => s.join("/"));
  it("keeps an ordered subset; no filters keeps everything; an exclusion always wins", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(path, { maxLength: 20 }),
        fc.array(fc.constantFrom("**/*.ts", "src/**", "**/*.md", "*"), { maxLength: 3 }),
        (paths, includes) => {
          expect(filterPaths(paths, [])).toEqual(paths);
          const kept = filterPaths(paths, includes);
          expect(kept).toEqual(paths.filter((p) => kept.includes(p)));
          for (const p of paths) expect(filterPaths(paths, [...includes, `!${p}`])).not.toContain(p);
        },
      ),
      RUNS,
    );
  });
});
