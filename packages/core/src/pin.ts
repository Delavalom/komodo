/**
 * Experiment `pin`: put a comment on the line its quoted code is on, not on
 * the line number the model typed.
 *
 * Ported in idea and in the shape of its matching from Alibaba's
 * OpenCodeReview (Apache-2.0), `internal/diff/resolver.go`
 * (`ResolveComment`, `resolveFromHunk`, `matchConsecutive`, `normalizeLine`)
 * and `internal/diff/relocation.go` (the "regenerate the snippet" step this
 * does not copy: it spends a second model call, this does none). OCR trusts
 * the model for the text it quotes and for nothing else; the line number is
 * derived by matching that text against the diff. See THIRD_PARTY_NOTICES.md.
 *
 * What differs from OCR, all of it deliberate:
 * - OCR matches one way: trimmed lines, equal, consecutive. Komodo adds three
 *   weaker tiers (whitespace-insensitive and re-wrapped, a fragment of a
 *   line, and fuzzy per-line similarity), tried only when the stricter tier
 *   found nothing.
 * - OCR takes the first match. Komodo takes the one nearest the line the model
 *   gave, because a quoted `return null;` is rarely unique.
 * - OCR falls back to scanning the whole new file. GitHub only accepts a
 *   comment on a line the diff shows, so the search domain here is exactly
 *   those lines (`commentableLines`), and a snippet that is not among them
 *   leaves the judgement where it was for the existing snap to deal with.
 *
 * The matching is pure and deterministic; nothing here talks to a model.
 */
import type { PRFile } from "./github.js";
import type { Judgement, ReviewResult } from "./schema.js";
import type { ReviewProvider } from "./providers/types.js";

/** The name this experiment is switched on by, in `RunReviewOptions.experiments`. */
export const PIN_EXPERIMENT = "pin";

/** Whether `experiments` (the eval-only list on `RunReviewOptions`) asks for pinning. */
export function pinEnabled(experiments: readonly string[] | undefined): boolean {
  return experiments?.includes(PIN_EXPERIMENT) ?? false;
}

/** One line of the new side of a patch: context or added, never deleted. */
export interface NewSideLine {
  /** Line number in the new file. */
  line: number;
  text: string;
}

/** The new-side lines of a patch grouped by hunk. Matches never span two hunks. */
export function newSideHunks(patch: string): NewSideLine[][] {
  const hunks: NewSideLine[][] = [];
  let current: NewSideLine[] | null = null;
  let newLine = 0;
  const rows = patch.split("\n");
  // A trailing newline is not a blank context line. (A blank line in the
  // middle is: some tools strip the single space GitHub puts before it.)
  if (rows[rows.length - 1] === "") rows.pop();
  for (const raw of rows) {
    const header = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (header) {
      newLine = parseInt(header[1], 10);
      current = [];
      hunks.push(current);
      continue;
    }
    if (!current) continue;
    if (raw.startsWith("-") || raw.startsWith("\\")) continue;
    // "+code" or " code"; a CRLF patch leaves a trailing \r that is not code.
    current.push({ line: newLine, text: raw.slice(1).replace(/\r$/, "") });
    newLine++;
  }
  return hunks;
}

export type PinTier = "exact" | "loose" | "fragment" | "fuzzy";

export interface PinMatch {
  line: number;
  /** Absent for a single line. */
  endLine?: number;
  tier: PinTier;
}

/** Below this similarity (0..1, mean over the quoted lines) a fuzzy match is refused. */
export const FUZZY_THRESHOLD = 0.8;
/** A fragment or fuzzy match on fewer characters than this is noise (`)`, `end`), not evidence. */
export const MIN_LOOSE_CHARS = 4;
/** Lines longer than this are cut before fuzzy comparison, so one minified line cannot cost a second. */
const FUZZY_MAX_CHARS = 200;

/**
 * Where the quoted code is, or null when it is nowhere in the diff.
 *
 * `hint` is the line the model cited, if any: among equally good matches the
 * one nearest it wins (distance 0 when the hint falls inside the match), then
 * the earlier one. The first tier that finds anything decides — a worse tier
 * never overrides a better one, even where it would sit closer to the hint.
 */
export function locateAnchor(
  anchor: string,
  hunks: NewSideLine[][],
  hint?: { line: number; endLine?: number },
): PinMatch | null {
  const target = quotedLines(anchor);
  if (!target.length) return null;

  // Blank lines are skipped on both sides (OCR's second hunk pass), so a blank
  // line the model dropped or added does not break a run of otherwise equal ones.
  const sequences = hunks
    .map((hunk) => hunk.filter((l) => l.text.trim() !== ""))
    .filter((hunk) => hunk.length > 0);

  const trimmed = target.map((t) => t.trim());
  const exact = windows(sequences, trimmed.length).filter((w) =>
    w.every((l, i) => l.text.trim() === trimmed[i]),
  );
  if (exact.length) return choose(exact, "exact", hint);

  const squeezed = squeeze(trimmed.join(""));
  if (squeezed.length) {
    const loose = reflowed(sequences, squeezed, "equal");
    if (loose.length) return choose(loose, "loose", hint);
    if (squeezed.length >= MIN_LOOSE_CHARS) {
      const fragment = reflowed(sequences, squeezed, "contains");
      if (fragment.length) return choose(fragment, "fragment", hint);
    }
  }

  if (squeezed.length >= MIN_LOOSE_CHARS) {
    const fuzzy = fuzzyWindows(sequences, trimmed);
    if (fuzzy.length) {
      const best = Math.max(...fuzzy.map((f) => f.score));
      return choose(
        fuzzy.filter((f) => best - f.score < 1e-9).map((f) => f.window),
        "fuzzy",
        hint,
      );
    }
  }
  return null;
}

/**
 * Applies `locateAnchor` to one judgement.
 *
 * Returns the judgement itself when there is nothing to do — no anchor, no
 * file, or a file-level concern (line 0 is the schema's "no single line owns
 * this") — and when the quote is nowhere in the patch, so a model that
 * paraphrased costs nothing but the anchor's tokens.
 */
export function pinJudgement(
  judgement: Judgement,
  patch: string | undefined,
): { judgement: Judgement; outcome: "unanchored" | "pinned" | "unmatched"; match?: PinMatch } {
  if (!judgement.anchor?.trim() || !judgement.path || judgement.line === 0 || !patch) {
    return { judgement, outcome: "unanchored" };
  }
  const match = locateAnchor(judgement.anchor, newSideHunks(patch), {
    line: judgement.line,
    endLine: judgement.endLine,
  });
  if (!match) return { judgement, outcome: "unmatched" };

  const moved: Judgement = { ...judgement, line: match.line };
  if (match.endLine === undefined) delete moved.endLine;
  else moved.endLine = match.endLine;
  return { judgement: moved, outcome: "pinned", match };
}

export interface PinStats {
  /** Judgements that carried an anchor and a line to move. */
  anchored: number;
  /** Of those, how many ended on a different line or range than the model gave. */
  moved: number;
  /** Anchored judgements whose quote was not in the patch; left where they were. */
  unmatched: number;
  /** Matches by the tier that found them. */
  tiers: Record<PinTier, number>;
}

export function emptyPinStats(): PinStats {
  return { anchored: 0, moved: 0, unmatched: 0, tiers: { exact: 0, loose: 0, fragment: 0, fuzzy: 0 } };
}

/** Pins every judgement of a result against the patch of its own file. */
export function pinResult(
  result: ReviewResult,
  files: Pick<PRFile, "path" | "patch">[],
  stats: PinStats = emptyPinStats(),
): ReviewResult {
  const patches = new Map(files.map((f) => [f.path, f.patch]));
  const judgements = result.judgements.map((j) => {
    const pinned = pinJudgement(j, patches.get(j.path));
    if (pinned.outcome === "unanchored") return j;
    stats.anchored++;
    if (pinned.outcome === "unmatched") {
      stats.unmatched++;
      return j;
    }
    stats.tiers[pinned.match!.tier]++;
    if (pinned.judgement.line !== j.line || pinned.judgement.endLine !== j.endLine) stats.moved++;
    return pinned.judgement;
  });
  return { ...result, judgements };
}

/**
 * A provider whose every result is pinned before anyone else sees it.
 *
 * Wrapping, not threading a flag through `runPasses`: the merge step compares
 * judgements by line, and a pinned line is a better thing to compare than the
 * one the model guessed, so pinning has to happen before the merge. This is
 * the one seam where that is true for every pass at every depth.
 */
export function withPinning(
  provider: ReviewProvider,
  files: Pick<PRFile, "path" | "patch">[],
  stats: PinStats = emptyPinStats(),
): ReviewProvider {
  return {
    name: provider.name,
    async review(input, onProgress) {
      return pinResult(await provider.review(input, onProgress), files, stats);
    },
  };
}

/** What the prompt asks for when the experiment is on. Empty (not a blank line) when off. */
export function pinPromptField(experiments: readonly string[] | undefined): string {
  if (!pinEnabled(experiments)) return "";
  return "\n- `anchor`: whenever `line` is not 0, the code the judgement is about, copied character for character from the diff above: the one to five consecutive lines it concerns, without the line-number gutter and without the leading `+`, `-` or space. Komodo finds that text in the file and puts the comment on the line it is really on, so a paraphrase is worse than nothing. Quote the fewest lines that are still unique, and still give your best `line` and `endLine`.";
}

// -- matching internals ------------------------------------------------------

/**
 * The lines of a quote, as code.
 *
 * Models copy from the annotated diff, so a gutter number (`   12 +code`) or a
 * bare diff marker comes along with the code often enough to matter. The
 * gutter is removed only when every line of the quote has one — a real line
 * that starts with a number must not lose it.
 */
function quotedLines(anchor: string): string[] {
  let lines = anchor.replace(/\r/g, "").split("\n").filter((l) => l.trim() !== "");
  if (lines.length && lines.every((l) => /^\s*\d{1,7} [+ -]/.test(l))) {
    lines = lines.map((l) => l.replace(/^\s*\d{1,7} /, ""));
  }
  // OCR's normalizeLine: a leading +/- is a diff marker, not code. Applied
  // only when every line has one, for the same reason as the gutter.
  if (lines.length && lines.every((l) => /^[+-]/.test(l))) lines = lines.map((l) => l.slice(1));
  return lines.filter((l) => l.trim() !== "");
}

function squeeze(text: string): string {
  return text.replace(/\s+/g, "");
}

type Window = NewSideLine[];

/** Every run of `size` adjacent lines (blanks already removed) within one hunk. */
function windows(sequences: NewSideLine[][], size: number): Window[] {
  const out: Window[] = [];
  for (const seq of sequences) {
    for (let i = 0; i + size <= seq.length; i++) out.push(seq.slice(i, i + size));
  }
  return out;
}

/**
 * Runs of lines whose whitespace-free concatenation equals (or contains) the
 * quote's, whatever line breaks either side has. A `contains` run is minimal:
 * dropping its first line stops it containing the quote.
 */
function reflowed(sequences: NewSideLine[][], squeezedQuote: string, mode: "equal" | "contains"): Window[] {
  const out: Window[] = [];
  for (const seq of sequences) {
    const flat = seq.map((l) => squeeze(l.text));
    for (let i = 0; i < seq.length; i++) {
      let acc = "";
      for (let j = i; j < seq.length; j++) {
        acc += flat[j];
        if (mode === "equal") {
          if (acc === squeezedQuote) {
            out.push(seq.slice(i, j + 1));
            break;
          }
          if (acc.length >= squeezedQuote.length || !squeezedQuote.startsWith(acc)) break;
        } else if (acc.includes(squeezedQuote)) {
          // Minimal at the front: the quote must not already sit wholly in the rest.
          if (!(flat.slice(i + 1, j + 1).join("").includes(squeezedQuote))) {
            out.push(seq.slice(i, j + 1));
          }
          break;
        }
      }
    }
  }
  return out;
}

function fuzzyWindows(sequences: NewSideLine[][], trimmed: string[]): { window: Window; score: number }[] {
  const wanted = trimmed.map((t) => squeeze(t).toLowerCase().slice(0, FUZZY_MAX_CHARS));
  const out: { window: Window; score: number }[] = [];
  for (const win of windows(sequences, trimmed.length)) {
    let total = 0;
    let ok = true;
    for (let i = 0; i < wanted.length; i++) {
      const s = similarity(wanted[i], squeeze(win[i].text).toLowerCase().slice(0, FUZZY_MAX_CHARS));
      // One line that is nothing like its counterpart sinks the window; a mean
      // alone would let nine exact lines carry a tenth that is unrelated.
      if (s < FUZZY_THRESHOLD - 0.25) {
        ok = false;
        break;
      }
      total += s;
    }
    if (!ok) continue;
    const score = total / wanted.length;
    if (score >= FUZZY_THRESHOLD) out.push({ window: win, score });
  }
  return out;
}

/** 1 - normalised Levenshtein distance. Two empty strings are identical. */
function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  // The distance is at least the difference in length; skip the quadratic part
  // for pairs that cannot reach the threshold.
  if (Math.abs(a.length - b.length) / longest > 1 - (FUZZY_THRESHOLD - 0.25)) return 0;
  return 1 - levenshtein(a, b) / longest;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

function choose(
  candidates: Window[],
  tier: PinTier,
  hint?: { line: number; endLine?: number },
): PinMatch {
  const span = (w: Window) => ({ start: w[0].line, end: w[w.length - 1].line });
  const distance = (w: Window) => {
    if (!hint || hint.line <= 0) return 0;
    const { start, end } = span(w);
    const hintEnd = hint.endLine ?? hint.line;
    // Overlapping the cited range at all is as near as it gets.
    if (hint.line <= end && hintEnd >= start) return 0;
    return Math.min(Math.abs(hint.line - end), Math.abs(hintEnd - start));
  };
  const best = [...candidates].sort(
    (a, b) => distance(a) - distance(b) || span(a).start - span(b).start,
  )[0];
  const { start, end } = span(best);
  return end === start ? { line: start, tier } : { line: start, endLine: end, tier };
}
