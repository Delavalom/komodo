import type { AacrInstance, ReviewerRun } from "../../src/aacr/types.js";

/**
 * A small fixed benchmark run, scored by both Komodo's TS port and the
 * official Python evaluator (see differential.test.ts). Every case below is
 * here for a reason:
 *
 * - greedy dedup: A's g4 re-covers what g1 covered, so it is no new hit;
 * - record order is by file, in the order files first appear: g2 (b.py) is
 *   generated before g3 (a.py) but a.py's records come first;
 * - one-to-many: g3 covers two references at once;
 * - comments the judge never sees still count as generated: g6 has no path,
 *   g7 is only a <details> block; g5 sits on a file with no references;
 * - a reference whose note is only <details> counts as expected, can never
 *   be covered;
 * - judge answers that are malformed (`[1,,2]`), out of range (`[9]`), a
 *   failure (null), or carry several brackets (the last one wins);
 * - a `\` path normalised to `/`; a line of 0 rendered as "?";
 * - instance C has no result, so it is missing, not zero;
 * - totals land on Python's half-even ties: precision 5/16 = 0.3125 → 0.312,
 *   duration 7.125 → 7.12, average tokens 1000.5 → 1000 and 50.5 → 50.
 */
export const fixtureInstances: AacrInstance[] = [
  {
    id: "acme__widgets@aaaaaaa",
    repo: "acme/widgets",
    prUrl: "https://github.com/acme/widgets/pull/1",
    language: "Python",
    baseCommit: "1111111111111111111111111111111111111111",
    headCommit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    changeLines: 120,
    references: [
      { path: "src/a.py", fromLine: 10, toLine: 12, side: "right", note: "Null check missing on user lookup.", category: "Bug", context: "Function Level" },
      { path: "src/a.py", fromLine: 20, toLine: 20, side: "right", note: "Loop is O(n^2) over the session list.", category: "Performance", context: "Function Level" },
      { path: "src/a.py", note: "Error from save() is swallowed.", category: "Bug", context: "File Level" },
      { path: "src/b.py", fromLine: 5, toLine: 5, side: "right", note: "Magic number 86400 should be a named constant.", category: "Maintainability", context: "Line Level" },
      { path: "src\\c.py", fromLine: 1, toLine: 2, side: "left", note: "Typo in docstring.", category: "Style", context: "Line Level" },
      { path: "src/a.py", fromLine: 30, toLine: 31, side: "right", note: "<details>only thinking</details>", category: "Other", context: "Line Level" },
    ],
  },
  {
    id: "acme__gadgets@bbbbbbb",
    repo: "acme/gadgets",
    prUrl: "https://github.com/acme/gadgets/pull/2",
    language: "Go",
    baseCommit: "2222222222222222222222222222222222222222",
    headCommit: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    changeLines: 40,
    references: [
      { path: "x.go", fromLine: 7, toLine: 9, side: "right", note: "Goroutine leaks when ctx is cancelled.", category: "Bug", context: "Function Level" },
      { path: "x.go", fromLine: 15, toLine: 15, side: "right", note: "Channel is closed twice on the error path.", category: "Bug", context: "Line Level" },
    ],
  },
  {
    id: "acme__tools@ccccccc",
    repo: "acme/tools",
    prUrl: "https://github.com/acme/tools/pull/3",
    language: "Go",
    baseCommit: "3333333333333333333333333333333333333333",
    headCommit: "cccccccccccccccccccccccccccccccccccccccc",
    changeLines: 10,
    references: [{ path: "main.go", fromLine: 3, toLine: 3, side: "right", note: "Unchecked error.", category: "Bug", context: "Line Level" }],
  },
];

const run = (instanceId: string, durationSeconds: number, inputTokens: number, outputTokens: number, comments: ReviewerRun["comments"]): ReviewerRun => ({
  instanceId,
  reviewer: "komodo",
  comments,
  durationSeconds,
  inputTokens,
  outputTokens,
  costUsd: 0.5,
});

/** Results for A and B; C has none. */
export const fixtureRuns: ReviewerRun[] = [
  run("acme__widgets@aaaaaaa", 12.345, 1001, 50, [
    { path: "src/a.py", fromLine: 10, toLine: 11, body: "The user lookup can return None and is dereferenced." },
    { path: "src/b.py", fromLine: 5, toLine: 5, body: "Hard-coded 86400 seconds; name it." },
    { path: "src/a.py", fromLine: 20, toLine: 20, body: "Quadratic loop and the swallowed save error." },
    { path: "src/a.py", fromLine: 11, toLine: 11, body: "Same None dereference again." },
    { path: "docs/readme.md", fromLine: 1, toLine: 1, body: "Readme wording." },
    { path: "", fromLine: 0, toLine: 0, body: "Architecture concern without a file." },
    { path: "src/a.py", fromLine: 12, toLine: 12, body: "<details>reasoning only</details>" },
    { path: "src/c.py", fromLine: 1, toLine: 1, body: "Docstring typo 'recieve'." },
    { path: "src/b.py", fromLine: 0, toLine: 0, body: "Constant should live in config." },
    { path: "src/c.py", fromLine: 2, toLine: 2, body: "Docstring typo again (judge down)." },
    { path: "src/a.py", fromLine: 40, toLine: 45, body: "Multiple brackets [1] in text." },
  ]),
  run("acme__gadgets@bbbbbbb", 7.125, 1000, 51, [
    { path: "y.go", fromLine: 1, toLine: 1, body: "Filler one." },
    { path: "x.go", fromLine: 8, toLine: 8, body: "Goroutine never exits after cancel." },
    { path: "y.go", fromLine: 2, toLine: 2, body: "Filler two." },
    { path: "x.go", fromLine: 15, toLine: 16, body: "Double close of the results channel." },
    { path: "y.go", fromLine: 3, toLine: 3, body: "Filler three." },
  ]),
];

/**
 * Canned judge answers, keyed by the generated comment's text. `null` makes
 * the judge fail. Comments the judge is never asked about have no entry.
 */
export const fixtureAnswers: Record<string, string | null> = {
  "The user lookup can return None and is dereferenced.": "1. Match — same null dereference\n2. No match\n3. No match\n\n[1]",
  "Hard-coded 86400 seconds; name it.": "1. Match — same constant\n\n[1]",
  "Quadratic loop and the swallowed save error.": "1. No match\n2. Match [x]\n3. Match\n\n[2, 3]",
  "Same None dereference again.": "[1]",
  "Docstring typo 'recieve'.": "Answer: [1,,2]",
  "Constant should live in config.": "[9]",
  "Docstring typo again (judge down).": null,
  "Multiple brackets [1] in text.": "I first thought [1] but no.\n[]",
  "Goroutine never exits after cancel.": "1. Match\n2. No match\n[1]",
  "Double close of the results channel.": "1. No match\n2. Match\n[2]",
};
