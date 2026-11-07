/**
 * Whether a pull request changes behaviour at all.
 *
 * The queue used to give every pull request the same weight, so a typo fix in
 * a README sat in the same slot as a migration. This is the rule that lets the
 * queue put the first below the second: a change is mechanical when every file
 * in it is documentation, comments, or a reflow of the same code.
 *
 * Deterministic and deliberately not the model's call. The reviewer marks
 * walkthrough rows mechanical too, but that is advice to a reader who has the
 * brief open; this decides what a person looks at first, and a routing rule a
 * model can talk its way past is not one anybody should trust.
 *
 * The burden of proof is on "mechanical". Anything this cannot read — a file
 * with no patch, a path filter that dropped a file, an extension it has no
 * comment syntax for — is behavioural, because the failure that matters is a
 * real change sinking to the bottom of the queue, not a typo fix staying near
 * the top.
 *
 * Nothing here is stored (AGENTS.md rule 4): it is computed from the patches
 * of the run at the current head, every time the queue is read.
 */

export type MechanicalReason = "docs" | "comments" | "whitespace";

export interface ChangeKindInput {
  /** The files the run at the current head read, after path filters. */
  files: { path: string; patch: string | null }[];
  /** How many files GitHub says the pull request changes, before any filter. */
  changedFiles: number;
}

/** The reasons, in a fixed order, or null for behavioural or unknown. */
export function changeKind(input: ChangeKindInput): MechanicalReason[] | null {
  // A path filter dropped something — a lockfile, a generated client. That is
  // exactly the file a dependency bump hides in, so the rest proves nothing.
  if (input.files.length === 0 || input.files.length < input.changedFiles) return null;

  const reasons = new Set<MechanicalReason>();
  for (const file of input.files) {
    const reason = fileKind(file.path, file.patch);
    if (!reason) return null;
    reasons.add(reason);
  }
  return ORDER.filter((r) => reasons.has(r));
}

const ORDER: MechanicalReason[] = ["docs", "comments", "whitespace"];

const DOCS = new Set(["md", "mdx", "rst", "adoc"]);

// Not `.txt`: requirements.txt and CMakeLists.txt are not documentation.
// Not CSS: a line starting with `*` there is the universal selector.
const SLASH = new Set([
  "js", "jsx", "mjs", "cjs", "ts", "tsx", "mts", "cts",
  "go", "rs", "java", "kt", "kts", "swift", "scala",
  "c", "h", "cc", "cpp", "hpp", "cs", "dart",
]);
const HASH = new Set(["py", "rb", "sh", "bash", "zsh", "yaml", "yml", "toml", "r", "ex", "exs"]);

// Where indentation is syntax, a whitespace change is a code change.
const WHITESPACE_SEMANTIC = new Set(["py", "yaml", "yml", "mk", "makefile"]);

// ponytail: a comment that steers a tool rather than a reader. The list is the
// common ones, not all of them; extend it when one is seen slipping through.
const DIRECTIVE =
  /^(#!|\/\/\/)|eslint|@ts-|ts-ignore|noqa|pylint|mypy|type:|pragma|go:|\+build|prettier-ignore|biome-ignore|istanbul|c8 |webpack|vite-ignore|__PURE__|frozen_string_literal|coding[:=]|-\*-|rubocop|nolint/;

function fileKind(path: string, patch: string | null): MechanicalReason | null {
  const name = path.split("/").pop()!.toLowerCase();
  const ext = name.includes(".") ? name.split(".").pop()! : name;
  if (DOCS.has(ext)) return "docs";

  // No patch is GitHub saying the file is binary or too large to show.
  if (patch === null) return null;
  const lines = hunkLines(patch);
  const changed = lines.filter((l) => l[0] === "+" || l[0] === "-");
  // A pure rename has no changed lines and still breaks every import of it.
  if (changed.length === 0) return null;

  if (onlyComments(ext, lines)) return "comments";
  if (!WHITESPACE_SEMANTIC.has(ext) && sameCode(changed)) return "whitespace";
  return null;
}

/** The lines inside hunks, without the file headers a local diff carries. */
function hunkLines(patch: string): string[] {
  const out: string[] = [];
  let inHunk = false;
  for (const line of patch.split("\n")) {
    if (line.startsWith("@@")) inHunk = true;
    else if (inHunk && line !== "" && line[0] !== "\\") out.push(line);
  }
  return out;
}

/**
 * Every added and removed line is a comment or blank.
 *
 * Block comments are tracked per side, because the trap is a `/*` added above
 * unchanged code and a `* /` added below it: every changed line is a comment
 * marker, and the code between them has stopped running. An unchanged line
 * met while either side is inside a block comment is that case.
 */
function onlyComments(ext: string, lines: string[]): boolean {
  const slash = SLASH.has(ext);
  if (!slash && !HASH.has(ext)) return false;

  const open = { "+": false, "-": false };
  for (const line of lines) {
    const side = line[0];
    if (side !== "+" && side !== "-") {
      if (open["+"] || open["-"]) return false;
      continue;
    }
    const text = line.slice(1).trim();
    if (text === "") continue;
    if (DIRECTIVE.test(text)) return false;

    if (!slash) {
      if (!text.startsWith("#")) return false;
      continue;
    }
    if (open[side]) {
      const close = text.indexOf("*/");
      if (close === -1) continue;
      // `*/ run()` closes the comment and then runs something.
      if (text.slice(close + 2).trim() !== "") return false;
      open[side] = false;
      continue;
    }
    if (text.startsWith("//")) continue;
    if (text.startsWith("/*")) {
      const close = text.indexOf("*/", 2);
      if (close === -1) open[side] = true;
      else if (text.slice(close + 2).trim() !== "") return false;
      continue;
    }
    // A `*` or `*/` line with no opening on this side continues or closes a
    // comment this diff did not open — which may be uncommenting code.
    return false;
  }
  return !open["+"] && !open["-"];
}

/**
 * The removed lines and the added lines are the same code once whitespace is
 * set aside.
 *
 * Whitespace next to punctuation is dropped and any other run becomes one
 * space, rather than all of it going: `"a b"` and `"ab"` must stay different.
 *
 * ponytail: a string literal whose only change is spacing around punctuation
 * (`"a , b"` to `"a,b"`) reads as a reflow. A tokenizer per language fixes
 * that; nothing has needed one yet.
 */
function sameCode(changed: string[]): boolean {
  const side = (mark: string) =>
    normalise(changed.filter((l) => l[0] === mark).map((l) => l.slice(1)).join(" "));
  return side("-") === side("+");
}

function normalise(text: string): string {
  return text.replace(/\s*([^\w\s])\s*/g, "$1").replace(/\s+/g, " ").trim();
}
