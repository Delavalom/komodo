/**
 * Experiment `grouping`: OCR-style file bundling into isolated sub-reviews.
 *
 * Ported from Alibaba's OpenCodeReview (Apache-2.0, commit dd1a7e1), see
 * THIRD_PARTY_NOTICES.md:
 *   - internal/agent/grouping.go   — the thresholds (GROUPING_MIN_FILES = 4,
 *     GROUPING_BUNDLE_LINE_THRESHOLD = 200), `maxFilesPerGroup = 10`,
 *     `GroupingPlan`, `enforceMaxFilesPerGroup`, `enforceGroupTokenBudget`.
 *   - internal/config/template/template.go — `GroupingPlan`.
 *   - internal/agent/selection.go  — deterministic pre-dispatch file selection.
 *   - internal/agent/agent.go (`dispatchSubtasks`) — one isolated sub-review
 *     per group, run under a semaphore, failures contained per group.
 *
 * One deliberate difference: OCR asks a model to partition the files
 * (GROUPING_TASK, which names i18n variants, interface + implementation, and
 * same-directory files as the relations to look for). Here the partition is
 * deterministic and free — the same relations are recognised from paths — so
 * the experiment measures bundling, not an extra model call, and the pure
 * function can be tested for exact properties.
 *
 * Only reachable through `RunReviewOptions.experiments` containing
 * "grouping"; it is not a setting.
 */
import { runPasses, type PassInput, type PassRun } from "./passes.js";
import { mergeResults } from "./merge.js";
import { DEPTH_PASSES, type ReviewDepth } from "./depth.js";
import type { ReviewResult, Judgement } from "./schema.js";
import type { PRFile } from "./github.js";
import type { BundleContext } from "./providers/types.js";

/** The value of `RunReviewOptions.experiments` that switches this on. */
export const GROUPING_EXPERIMENT = "grouping";

/** Sub-reviews in flight at once. OCR defaults to 8; Komodo's agent passes are heavier. */
export const GROUPING_CONCURRENCY = 3;

export interface BundleOptions {
  /** OCR GROUPING_MIN_FILES: fewer reviewable files than this are not partitioned by relation. */
  minFiles: number;
  /** OCR GROUPING_BUNDLE_LINE_THRESHOLD: a small change set under this many changed lines is one unit. */
  smallChangeLines: number;
  /** OCR maxFilesPerGroup. */
  maxFilesPerBundle: number;
  /**
   * Patch characters one multi-file bundle may hold (OCR's token valve, as
   * characters: ~4 per token). A single file larger than this still gets a
   * bundle of its own — it cannot be split.
   */
  maxBundleChars: number;
}

export const DEFAULT_BUNDLE_OPTIONS: BundleOptions = {
  minFiles: 4,
  smallChangeLines: 200,
  maxFilesPerBundle: 10,
  maxBundleChars: 120_000,
};

/** The fields of a changed file that bundling reads. */
export type BundleFile = Pick<PRFile, "path" | "additions" | "deletions" | "patch">;

export interface Bundle<T extends BundleFile = BundleFile> {
  /** A short name for logs: the file itself, or the shared directory and a count. */
  label: string;
  /** Sorted by path. */
  files: T[];
}

/**
 * Whether a file can be reviewed from its diff. A file with no textual patch
 * (binary, or too large for GitHub to send) has nothing to read; it stays
 * visible to every bundle as context instead. Deletions are kept — unlike
 * OCR, which never dispatches them — because Komodo's baseline reads them and
 * the experiment should change one thing.
 */
export function isReviewable(file: Pick<BundleFile, "patch">): boolean {
  return !!file.patch;
}

// ── relations ──────────────────────────────────────────────────────────────

/** Directory names that carry no identity: layout, not meaning. */
const NEUTRAL_DIRS = new Set(["src", "lib", "main", "test", "tests", "__tests__", "spec", "specs", "impl", "java"]);

/** Locale tags that mark a variant of the same resource. Ambiguous ones (id, he, is, it) are left out. */
const LOCALES = [
  "en", "zh", "fr", "de", "es", "pt", "ja", "ko", "ru", "nl", "pl", "tr", "ar", "hi", "vi", "th", "sv", "cs", "uk",
  "da", "fi", "no", "el", "hu", "ro", "bg",
];
const LOCALE = LOCALES.join("|");
const LOCALE_SEGMENT = new RegExp(`^(?:${LOCALE})(?:[_-][a-z]{2,4})?$`, "i");
const LOCALE_SUFFIX = new RegExp(`^(.+?)[._-](?:${LOCALE})(?:[_-][a-z]{2,4})?$`, "i");

/**
 * What a path is "about": its directory and its stem, with the decoration
 * that makes two files variants of one thing taken off. Two files with the
 * same key are related — the relations OCR's grouping prompt names:
 *
 *   message_en.properties / message_zh.properties   locale variants
 *   src/merge.ts / test/merge.test.ts               source and its test
 *   IFoo.java / FooImpl.java / Foo.java             interface and implementation
 *   Button.tsx / Button.module.css                  one unit in several files
 */
export function relationKey(path: string): string {
  const segments = path.split("/");
  const base = segments[segments.length - 1];
  const dir = segments
    .slice(0, -1)
    .filter((s) => !NEUTRAL_DIRS.has(s.toLowerCase()) && !LOCALE_SEGMENT.test(s));

  // Everything after the first dot is extension decoration: `.test.ts`,
  // `.module.css`, `.d.ts`. A dotfile is its own name.
  const dot = base.indexOf(".", 1);
  let stem = dot === -1 ? base : base.slice(0, dot);

  // Camel-case markers are cut before lower-casing, while case still tells
  // `FooTest` from `Latest` and `IFoo` from `Item`.
  stem = stem
    .replace(/(?<=[a-z0-9])(?:Tests?|Spec|Impl)$/, "")
    .replace(/^(?:Abstract|Base)(?=[A-Z])/, "")
    .replace(/^I(?=[A-Z][a-z])/, "");
  stem = stem.toLowerCase();
  stem = stem.replace(/[_-](?:tests?|spec)$/, "").replace(/^tests?[_-]/, "");
  const locale = LOCALE_SUFFIX.exec(stem);
  if (locale) stem = locale[1];
  if (!stem) stem = base.toLowerCase();

  return [...dir, stem].join("/").toLowerCase();
}

// ── bundling ───────────────────────────────────────────────────────────────

const byPath = (a: BundleFile, b: BundleFile): number => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
const chars = (f: BundleFile): number => f.patch?.length ?? 0;
const changed = (f: BundleFile): number => f.additions + f.deletions;

/**
 * Partitions a change set into review bundles.
 *
 * Pure and deterministic: the same files in any order give the same bundles.
 * Every reviewable file lands in exactly one bundle; files without a patch
 * are in none (see `isReviewable`). No multi-file bundle exceeds
 * `maxFilesPerBundle` files or `maxBundleChars` patch characters.
 *
 * Mirrors OCR's `GroupingPlan`: fewer files than `minFiles` are not
 * partitioned — a small total change is one bundle, a larger one a bundle per
 * file. From `minFiles` up, files that share a relation key stay together,
 * and the groups are packed in path order (so a directory's files sit side by
 * side) into bundles within the caps.
 */
export function bundleFiles<T extends BundleFile>(
  files: readonly T[],
  options: Partial<BundleOptions> = {},
): Bundle<T>[] {
  const opts = { ...DEFAULT_BUNDLE_OPTIONS, ...options };
  const maxFiles = Math.max(1, Math.floor(opts.maxFilesPerBundle));
  const reviewable = files.filter(isReviewable).sort(byPath);
  if (!reviewable.length) return [];

  if (reviewable.length === 1) return [bundleOf(reviewable)];

  if (opts.minFiles > 0 && reviewable.length < opts.minFiles) {
    const total = reviewable.reduce((sum, f) => sum + changed(f), 0);
    // OCR bundles only when the whole change is small, and then lets the
    // size valves degrade it to per-file if it turns out too big to share.
    if (opts.smallChangeLines > 0 && total < opts.smallChangeLines) {
      return splitToCaps([reviewable], maxFiles, opts.maxBundleChars).map(bundleOf);
    }
    return reviewable.map((f) => bundleOf([f]));
  }

  const related = new Map<string, T[]>();
  for (const file of reviewable) {
    const key = relationKey(file.path);
    const group = related.get(key);
    if (group) group.push(file);
    else related.set(key, [file]);
  }
  // Map order is first-seen order over path-sorted files, so atoms are
  // already ordered by their first path.
  const atoms = splitToCaps([...related.values()], maxFiles, opts.maxBundleChars);

  const packed: T[][] = [];
  let current: T[] = [];
  let currentChars = 0;
  for (const atom of atoms) {
    const size = atom.reduce((sum, f) => sum + chars(f), 0);
    if (current.length && (current.length + atom.length > maxFiles || currentChars + size > opts.maxBundleChars)) {
      packed.push(current);
      current = [];
      currentChars = 0;
    }
    current = current.concat(atom);
    currentChars += size;
  }
  if (current.length) packed.push(current);
  return packed.map((group) => bundleOf(group.sort(byPath)));
}

/** Cuts any group over a cap into runs that fit; a lone file over the char cap is left whole. */
function splitToCaps<T extends BundleFile>(groups: T[][], maxFiles: number, maxChars: number): T[][] {
  const out: T[][] = [];
  for (const group of groups) {
    let run: T[] = [];
    let runChars = 0;
    for (const file of group) {
      const size = chars(file);
      if (run.length && (run.length >= maxFiles || runChars + size > maxChars)) {
        out.push(run);
        run = [];
        runChars = 0;
      }
      run.push(file);
      runChars += size;
    }
    if (run.length) out.push(run);
  }
  return out;
}

function bundleOf<T extends BundleFile>(files: T[]): Bundle<T> {
  if (files.length === 1) return { label: files[0].path, files };
  const dirs = files.map((f) => f.path.split("/").slice(0, -1));
  let common = dirs[0];
  for (const d of dirs.slice(1)) {
    let n = 0;
    while (n < common.length && n < d.length && common[n] === d[n]) n++;
    common = common.slice(0, n);
  }
  return { label: `${common.length ? common.join("/") : "."} (${files.length} files)`, files };
}

// ── running ────────────────────────────────────────────────────────────────

/** Maps with at most `limit` calls in flight; results keep input order. Never rejects for a single item. */
async function mapLimit<A, B>(items: readonly A[], limit: number, fn: (item: A, index: number) => Promise<B>): Promise<B[]> {
  const results = new Array<B>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return results;
}

export interface FailedBundle {
  label: string;
  paths: string[];
  error: string;
}

export interface GroupedPassRun extends PassRun {
  bundles: number;
  failed: FailedBundle[];
}

/**
 * Runs the ordinary pass machinery once per bundle, concurrently, and merges.
 *
 * Each bundle sees only its own files' diffs, plus the pull request's title,
 * description and shared context, and a list of the other changed files. Depth
 * applies inside every bundle. A bundle whose base pass fails is reported and
 * left out; the run fails only when every bundle did, which is what a failed
 * base pass means for an ungrouped run.
 */
export async function runGroupedPasses(opts: {
  provider: Parameters<typeof runPasses>[0]["provider"];
  input: PassInput;
  depth: ReviewDepth;
  bundles: Bundle<PRFile>[];
  accept?: (judgement: Judgement) => boolean;
  onProgress?: (msg: string) => void;
  concurrency?: number;
}): Promise<GroupedPassRun> {
  const { provider, input, depth, bundles, accept, onProgress } = opts;
  const total = bundles.length;

  const outcomes = await mapLimit(bundles, opts.concurrency ?? GROUPING_CONCURRENCY, async (bundle, i) => {
    const inBundle = new Set(bundle.files.map((f) => f.path));
    const context: BundleContext = {
      index: i + 1,
      total,
      otherFiles: input.files
        .filter((f) => !inBundle.has(f.path))
        .map(({ path, status, additions, deletions }) => ({ path, status, additions, deletions })),
    };
    const tag = `  [bundle ${i + 1}/${total}] `;
    try {
      const run = await runPasses({
        provider,
        input: { ...input, files: bundle.files, bundle: context },
        depth,
        accept,
        onProgress: onProgress && ((m) => onProgress(`${tag}${m}`)),
      });
      // A bundle answers for its own files. Cross-cutting judgements (no
      // path) are kept; a stray one about a file another bundle owns is not.
      const result = {
        ...run.result,
        judgements: run.result.judgements.filter((j) => !j.path || inBundle.has(j.path)),
      };
      return { ok: true as const, run, result };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      onProgress?.(`${tag}failed; continuing with the other bundles: ${error}`);
      return {
        ok: false as const,
        failed: { label: bundle.label, paths: bundle.files.map((f) => f.path), error },
      };
    }
  });

  const succeeded = outcomes.flatMap((o) => (o.ok ? [o] : []));
  const failed = outcomes.flatMap((o) => (o.ok ? [] : [o.failed]));
  if (!succeeded.length) {
    throw new Error(`Every file bundle failed to review. First error: ${failed[0]?.error ?? "none"}`);
  }

  let costUsd: number | null = null;
  let passes = 0;
  for (const { run } of succeeded) {
    passes += run.passes;
    if (run.costUsd !== null) costUsd = (costUsd ?? 0) + run.costUsd;
  }

  return {
    result: combineBundleResults(
      succeeded.map((o) => o.result),
      failed,
      accept,
    ),
    // A record cannot claim more passes than its depth ever runs; the
    // per-bundle total is still visible in the progress log and in costUsd.
    passes: Math.min(passes, DEPTH_PASSES[depth]),
    costUsd,
    bundles: total,
    failed,
  };
}

/**
 * Folds per-bundle results into one.
 *
 * Judgements and verification checks go through the existing `mergeResults`
 * (so dedup is the one rule it always was). The prose that describes the whole
 * change is assembled rather than picked: every bundle only saw its own files,
 * so the first bundle's summary alone would describe a fraction of the PR.
 * The diagram is dropped for the same reason — one bundle's picture is not the
 * change's. Confidence is the weakest bundle's, capped when files went
 * unreviewed; effort is the heaviest.
 */
export function combineBundleResults(
  results: ReviewResult[],
  failed: FailedBundle[] = [],
  accept?: (judgement: Judgement) => boolean,
): ReviewResult {
  const [base, ...rest] = results;
  const merged = mergeResults(base, rest, accept);
  if (results.length === 1 && !failed.length) return merged;

  const unreviewed = failed.reduce((sum, f) => sum + f.paths.length, 0);
  const notes = [`Reviewed as ${results.length + failed.length} separate file bundles.`];
  if (unreviewed) notes.push(`${unreviewed} file(s) in ${failed.length} failed bundle(s) were not reviewed.`);

  const { diagram: _dropped, ...withoutDiagram } = merged;
  return {
    ...withoutDiagram,
    summary: results.map((r) => r.summary.trim()).filter(Boolean).join("\n"),
    walkthrough: results.flatMap((r) => r.walkthrough),
    confidence: Math.min(...results.map((r) => r.confidence), unreviewed ? 2 : 5),
    effort: Math.max(...results.map((r) => r.effort)),
    verdict: `${base.verdict.trim()} ${notes.join(" ")}`,
  };
}
