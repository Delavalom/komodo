import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { effectivePathFilters, type KomodoConfig } from "./config.js";
import { selectSharedContext, type ResolvedContextSource } from "./context-sources.js";
import { changeFingerprint, commentableLines, filterPaths } from "./diff.js";
import { readFeatureMap } from "./feature-map.js";
import type { DiffFile, DiffMeta } from "./diff-source.js";
import { resolveDepth, type DepthDecision, type DepthRequest } from "./depth-rules.js";
import { LocalGitDiffSource } from "./diff-sources/local-git.js";
import { runPasses, type PassRun } from "./passes.js";
import { bundleFiles, GROUPING_EXPERIMENT, runGroupedPasses } from "./grouping.js";
import { emptyPinStats, pinEnabled, withPinning, type PinStats } from "./pin.js";
import { DEPTH_TURNS } from "./depth.js";
import { REFLECT_EXPERIMENT, runReflection, type ReflectionReport } from "./reflect.js";
import {
  judgementToComment,
  GitHubClient,
  type PRFile,
  type PRMeta,
  type PRRef,
} from "./github.js";
import type { ReviewMemory, ReviewProvider } from "./providers/types.js";
import {
  renderDescriptionBlock,
  renderJudgementComment,
  renderReceipt,
  renderReviewBody,
  renderWalkthroughComment,
  sortJudgements,
  WALKTHROUGH_MARKER,
} from "./render/markdown.js";
import { SEVERITY_RANK, type Judgement, type ReviewRecord, type ReviewResult } from "./schema.js";

export interface RunReviewOptions {
  ref: PRRef;
  provider: ReviewProvider;
  config: KomodoConfig;
  github: GitHubClient;
  /** Local checkout of the PR head for full-repo context. */
  repoDir?: string;
  /**
   * The team's own conventions, already narrowed to those that apply here.
   *
   * Selected by the caller rather than here: choosing them needs the store,
   * and this package must not acquire that dependency. See
   * packages/ingest/src/memory.ts.
   */
  memories?: ReviewMemory[];
  /**
   * Shared context sources already resolved off disk by the caller, via
   * `resolveContextSources`. Resolution (filesystem I/O) is kept out of this
   * function so a caller that already resolved once — e.g. once at boot — can
   * reuse the result across many reviews.
   */
  contextSources?: ResolvedContextSource[];
  /**
   * Which repository (and, when the caller has a store, which clusters it
   * belongs to) to select shared context for. Omit `clusterNames` when the
   * caller cannot resolve clusters (e.g. `komodo pr`, which has no store) —
   * cluster-scoped documents are then reported as needing one rather than
   * silently dropped.
   */
  contextScope?: { repoId: string; clusterNames?: string[] };
  /** Post to GitHub (default true). false = local-only dry run. */
  post?: boolean;
  /** Directory where review JSON records are written (default <cwd>/.komodo/reviews). */
  outDir?: string;
  onProgress?: (msg: string) => void;
  model?: string;
  /**
   * A depth someone chose for this run. Overrides the deployment default and
   * every rule in `config.depth` — someone asking for a thorough review of a
   * one-line change gets one. Omitted, the rules decide.
   */
  depthRequest?: DepthRequest | null;
  /**
   * The head this run was asked to read — a claimed job's. When GitHub's head
   * is anything else, the run stops with HeadMovedError before a model is
   * paid for, rather than writing a review under a head nobody claimed.
   */
  expectedHeadSha?: string;
  /**
   * Eval-only switches for experimental behaviour, by name, carried into
   * every provider call as `ReviewInput.experiments`. Set by `komodo-review
   * eval --experiment` and nothing else: not a setting, so no screen or
   * komodo.yaml field reaches it (AGENTS.md rule 3). Recognised: `grouping`
   * (bundle related files into isolated sub-reviews — see grouping.ts),
   * `pin` (place judgements by their quoted anchor — see pin.ts) and
   * `reflect` (after the passes merge, one more call checks each judgement
   * against the code and drops, tightens or keeps it — see reflect.ts).
   * Absent or empty, a review runs exactly as it always has.
   */
  experiments?: string[];
}

/** The pull request moved past the head a run was claimed for. Not a failure. */
export class HeadMovedError extends Error {
  constructor(
    readonly expected: string,
    readonly actual: string,
  ) {
    super(
      `The pull request moved from ${expected.slice(0, 7)} to ${actual.slice(0, 7)} before the review started.`,
    );
    this.name = "HeadMovedError";
  }
}

/** A judgement the run did not show, and — when something other than the filters removed it — why. */
export type DroppedJudgement = Judgement & { droppedBy?: "reflect"; dropReason?: string };

export interface RunReviewOutcome {
  record: ReviewRecord;
  recordPath: string;
  reviewUrl?: string;
  droppedJudgements: DroppedJudgement[];
  /** Shared context documents actually handed to the provider, for a caller that wants to say so. */
  sharedContext: { label: string }[];
  /** Documents scoped to a repo cluster the caller had no way to resolve (e.g. `komodo pr`, which has no store). */
  sharedContextNeedsClusters: { label: string }[];
  /**
   * The change this run read, from every file before path filters — see
   * `changeFingerprint`. On the outcome and never on the record: a record can
   * arrive from a laptop, and a fingerprint is what lets a review follow a
   * rebase, so only a run that fetched the files itself may state one.
   */
  changeFingerprint: string | null;
  /** Where the feature map handed to the provider was read from, or null when there was none. */
  featureMap: string | null;
  /** What the `pin` experiment did to this run's judgements; absent when it was off. */
  pin?: PinStats;
  /** What the `reflect` experiment did, or null when it was not switched on. */
  reflection: ReflectionReport | null;
}

/**
 * Where the receipt points. The review id is the judgment id the store
 * derives — `owner/name#number@sha` — and the route spells it out in path
 * segments, so the link survives being read by a human.
 */
function komodoReviewUrl(config: KomodoConfig, pr: PRMeta): string {
  const base = config.local.url.replace(/\/$/, "");
  return `${base}/-/pr/${pr.owner}/${pr.repo}/${pr.number}?run=${pr.headSha}`;
}

export async function runReview(opts: RunReviewOptions): Promise<RunReviewOutcome> {
  const { ref, provider, config, github, onProgress } = opts;
  const post = opts.post ?? true;

  onProgress?.(`Fetching PR ${ref.owner}/${ref.repo}#${ref.number}…`);
  // Files first, then the head. A claimed head was current at the claim and
  // is current again here, so the files read in between are that head's.
  const allFiles = await github.listFiles(ref);
  const pr = await github.getPR(ref);
  if (opts.expectedHeadSha && pr.headSha !== opts.expectedHeadSha) {
    throw new HeadMovedError(opts.expectedHeadSha, pr.headSha);
  }

  const reviewed = await reviewChange({
    pr,
    allFiles,
    provider,
    config,
    repoDir: opts.repoDir,
    memories: opts.memories,
    contextSources: opts.contextSources,
    contextScope: opts.contextScope,
    onProgress,
    depthRequest: opts.depthRequest,
    experiments: opts.experiments,
  });
  const { files, shared, featureMap, decision, passRun, dropped } = reviewed;
  const finalResult = reviewed.result;

  const record: ReviewRecord = {
    version: 3,
    id: `${ref.owner}-${ref.repo}-${ref.number}-${Date.now()}`,
    createdAt: new Date().toISOString(),
    provider: provider.name,
    model: opts.model,
    pr: {
      owner: pr.owner,
      repo: pr.repo,
      number: pr.number,
      title: pr.title,
      author: pr.author,
      url: pr.url,
      baseRef: pr.baseRef,
      headRef: pr.headRef,
      headSha: pr.headSha,
    },
    files: files.map(({ path, additions, deletions, status, patch }) => ({
      path,
      additions,
      deletions,
      status,
      patch,
    })),
    result: finalResult,
    run: {
      depth: decision.depth,
      depthReason: decision.reason,
      passes: passRun.passes,
      costUsd: passRun.costUsd,
    },
    posted: false,
  };

  const outDir = opts.outDir ?? join(process.cwd(), ".komodo", "reviews");
  mkdirSync(outDir, { recursive: true });
  const recordPath = join(outDir, `${record.id}.json`);
  writeFileSync(recordPath, JSON.stringify(record, null, 2));

  let reviewUrl: string | undefined;
  if (post && config.post.mode === "receipt") {
    // The review already exists — in Komodo. This tells GitHub it happened and
    // where to answer it, and stops there: an inline comment per judgement
    // would be the same content in a place that cannot take an answer.
    onProgress?.("Posting the receipt to GitHub…");
    const receipt = await github.upsertWalkthroughComment(
      ref,
      WALKTHROUGH_MARKER,
      withHeader(config, renderReceipt(pr, finalResult, komodoReviewUrl(config, pr))),
    );
    reviewUrl = receipt.html_url;

    if (config.post.status_check) {
      await github.postStatus(ref, pr.headSha, "pending", verificationStatus(finalResult));
    }
    record.posted = true;
    writeFileSync(recordPath, JSON.stringify(record, null, 2));
  } else if (post && config.post.mode === "full") {
    onProgress?.("Posting review to GitHub…");
    const walkthrough = withHeader(config, renderWalkthroughComment(pr, finalResult, config));
    await github.upsertWalkthroughComment(ref, WALKTHROUGH_MARKER, walkthrough);

    const comments = finalResult.judgements.map((f) =>
      judgementToComment(f, renderJudgementComment(f, config.post.include_fix_prompts)),
    );
    let review: { html_url: string };
    review = await github.postReview(
      ref,
      pr.headSha,
      renderReviewBody(finalResult),
      comments,
    );
    reviewUrl = review.html_url;

    if (config.post.update_description) {
      await github.updateDescription(ref, pr.body, renderDescriptionBlock(finalResult));
    }
    if (config.post.status_check) {
      await github.postStatus(ref, pr.headSha, "pending", verificationStatus(finalResult));
    }
    record.posted = true;
    writeFileSync(recordPath, JSON.stringify(record, null, 2));
  }

  return {
    record,
    recordPath,
    reviewUrl,
    droppedJudgements: dropped,
    sharedContext: shared.docs.map((d) => ({ label: d.label })),
    sharedContextNeedsClusters: shared.needsClusters.map((f) => ({ label: f.label })),
    changeFingerprint: changeFingerprint(allFiles),
    featureMap: featureMap?.path ?? null,
    ...(reviewed.pin ? { pin: reviewed.pin } : {}),
    reflection: reviewed.reflection,
  };
}

/** Everything `reviewChange` needs: a change already read, and how to review it. */
export interface ReviewChangeOptions {
  pr: PRMeta;
  /** Every changed file, before path filters. */
  allFiles: PRFile[];
  provider: ReviewProvider;
  config: KomodoConfig;
  repoDir?: string;
  memories?: ReviewMemory[];
  contextSources?: ResolvedContextSource[];
  contextScope?: { repoId: string; clusterNames?: string[] };
  onProgress?: (msg: string) => void;
  depthRequest?: DepthRequest | null;
  experiments?: string[];
}

export interface ReviewChangeOutcome {
  /** The reviewable files, after path filters. */
  files: PRFile[];
  /** Judgements that survived `validateJudgements`, sorted as the review shows them. */
  result: ReviewResult;
  /**
   * Judgements the passes raised that did not survive: filtered by
   * `validateJudgements`, or removed by the `reflect` experiment (those carry
   * `droppedBy: "reflect"` and a reason).
   */
  dropped: DroppedJudgement[];
  /** Cost and tokens include the `reflect` call when it ran. */
  passRun: PassRun;
  decision: DepthDecision;
  shared: ReturnType<typeof selectSharedContext>;
  featureMap: ReturnType<typeof readFeatureMap>;
  /** What the `pin` experiment did to this run's judgements; absent when it was off. */
  pin?: PinStats;
  /** What the `reflect` experiment did, or null when it was not switched on. */
  reflection: ReflectionReport | null;
}

/** No file in the change survived the path filters, so there is nothing to review. */
export class NoReviewableFilesError extends Error {
  constructor() {
    super("No reviewable files after path filters.");
    this.name = "NoReviewableFilesError";
  }
}

/**
 * The review itself, from a change already read to the judgements a person
 * would be shown: path filters, shared context, the feature map, the depth
 * decision, the passes and their merge, and the final `validateJudgements`
 * filter. Nothing here reads GitHub, writes a record or posts.
 *
 * `runReview` is this plus GitHub on either side. `runLocalReview` is this
 * plus a local git range, for the benchmark harness — one pipeline, so a
 * score measures the reviewer people actually get.
 */
export async function reviewChange(opts: ReviewChangeOptions): Promise<ReviewChangeOutcome> {
  const { pr, allFiles, provider, config, onProgress } = opts;
  const keptPaths = new Set(filterPaths(allFiles.map((f) => f.path), effectivePathFilters(config)));
  const files = allFiles.filter((f) => keptPaths.has(f.path));
  onProgress?.(`Reviewing ${files.length}/${allFiles.length} files with ${provider.name}…`);
  if (!files.length) throw new NoReviewableFilesError();

  const shared = selectSharedContext(opts.contextSources ?? [], {
    repoId: opts.contextScope?.repoId,
    clusterNames: opts.contextScope?.clusterNames,
    changedPaths: files.map((f) => f.path),
    maxTotalChars: config.context.max_total_chars,
  });
  if (shared.docs.length) {
    onProgress?.(`  applying ${shared.docs.length} shared context document(s).`);
  }
  if (shared.overflow.length) {
    onProgress?.(`  ${shared.overflow.length} shared context document(s) skipped: over the ${config.context.max_total_chars}-character cap.`);
  }
  if (shared.needsClusters.length) {
    onProgress?.(`  ${shared.needsClusters.length} shared context document(s) skipped: scoped to a repo cluster, which this caller cannot resolve.`);
  }

  // Only from a checkout: the map has to describe the head being reviewed,
  // and without a working tree there is no head to read it from.
  const featureMap = opts.repoDir ? readFeatureMap(opts.repoDir) : null;
  if (featureMap) {
    onProgress?.(
      `  writing checks from the feature map in ${featureMap.path}${featureMap.truncated ? " (truncated)" : ""}.`,
    );
  }

  // Decided on the reviewable set, after path filters: a lockfile rewrite is
  // not a reason to look harder at the code.
  const decision = resolveDepth(config, { files, labels: pr.labels }, opts.depthRequest);
  onProgress?.(`  depth: ${decision.depth} — ${decision.reason}.`);
  const experiments = opts.experiments ?? [];
  const pin = pinEnabled(experiments) ? emptyPinStats() : undefined;
  const reviewProvider = pin ? withPinning(provider, files, pin) : provider;
  const passInput = {
    pr,
    files,
    config,
    repoDir: opts.repoDir,
    memories: opts.memories,
    sharedContext: shared.docs,
    featureMap: featureMap ?? undefined,
    ...(experiments.length ? { experiments } : {}),
  };
  const accept = judgementCheck(files, config);

  // Experiment `grouping`. One bundle is the ordinary review, so a small
  // change set takes the unchanged path.
  const bundles = experiments.includes(GROUPING_EXPERIMENT) ? bundleFiles(files) : [];
  let passRun: PassRun;
  if (bundles.length > 1) {
    onProgress?.(`  grouping: ${bundles.length} bundles — ${bundles.map((b) => b.label).join("; ")}.`);
    passRun = await runGroupedPasses({
      provider: reviewProvider,
      input: passInput,
      depth: decision.depth,
      bundles,
      accept,
      onProgress,
    });
  } else {
    if (experiments.includes(GROUPING_EXPERIMENT)) onProgress?.("  grouping: one bundle, reviewing as a single unit.");
    passRun = await runPasses({ provider: reviewProvider, input: passInput, depth: decision.depth, accept, onProgress });
  }
  let result = passRun.result;
  if (pin) {
    onProgress?.(
      `  pin: ${pin.anchored} anchored, ${pin.moved} moved, ${pin.unmatched} not found in the diff (kept where they were).`,
    );
  }

  // Experiment `reflect`: after the passes merge, before anything is
  // filtered, so what it removes is reported with its reason and what it
  // leaves still meets the same checks as everything else.
  let reflection: ReflectionReport | null = null;
  const reflectDropped: DroppedJudgement[] = [];
  if (experiments.includes(REFLECT_EXPERIMENT)) {
    const reflected = await runReflection({
      provider,
      input: {
        pr,
        files,
        judgements: result.judgements,
        config,
        repoDir: opts.repoDir,
        turnBudget: DEPTH_TURNS[decision.depth],
      },
      onProgress,
    });
    reflection = reflected.report;
    result = { ...result, judgements: reflected.judgements };
    for (const { judgement, reason } of reflected.report.dropped) {
      reflectDropped.push({ ...judgement, droppedBy: "reflect", dropReason: reason });
    }
    // The cost is real whether or not it changed anything. It joins the
    // run's cost and tokens rather than the pass count: a pass is a credit,
    // and the record refuses more passes than the depth runs.
    passRun = {
      ...passRun,
      costUsd: addNullable(passRun.costUsd, reflection.costUsd),
      inputTokens: addNullable(passRun.inputTokens, reflection.inputTokens),
      outputTokens: addNullable(passRun.outputTokens, reflection.outputTokens),
    };
  }

  const { valid, dropped } = validateJudgements(result, files, config);
  const finalResult: ReviewResult = { ...result, judgements: sortJudgements(valid) };

  return {
    files,
    result: finalResult,
    dropped: [...dropped, ...reflectDropped],
    passRun,
    decision,
    shared,
    featureMap,
    ...(pin ? { pin } : {}),
    reflection,
  };
}

/** Sum of two provider-reported numbers; null only when neither side reported one. */
function addNullable(a: number | null, b: number | null): number | null {
  return a === null && b === null ? null : (a ?? 0) + (b ?? 0);
}

export interface RunLocalReviewOptions {
  /** A checkout holding both commits. The provider's tools read files from here. */
  repoDir: string;
  /** The base the change is measured from; the merge-base with `head` is taken. */
  base: string;
  /** The commit under review. */
  head: string;
  provider: ReviewProvider;
  config: KomodoConfig;
  onProgress?: (msg: string) => void;
  depthRequest?: DepthRequest | null;
  experiments?: string[];
  memories?: ReviewMemory[];
  contextSources?: ResolvedContextSource[];
}

export interface RunLocalReviewOutcome extends ReviewChangeOutcome {
  meta: DiffMeta;
  /** Every changed file, before path filters. */
  allFiles: DiffFile[];
}

/**
 * Reviews `base...head` of a local checkout with the same pipeline as
 * `runReview`, without GitHub: no pull request is fetched, nothing is posted
 * and no record is written. Built for `komodo-review eval aacr`, which needs
 * Komodo's real preflight on a benchmark pull request it cannot post to.
 */
export async function runLocalReview(opts: RunLocalReviewOptions): Promise<RunLocalReviewOutcome> {
  const source = new LocalGitDiffSource(opts.repoDir, opts.base, opts.head);
  const meta = await source.getMeta();
  const allFiles = await source.getFiles();
  const outcome = await reviewChange({
    pr: meta,
    allFiles,
    provider: opts.provider,
    config: opts.config,
    repoDir: opts.repoDir,
    memories: opts.memories,
    contextSources: opts.contextSources,
    onProgress: opts.onProgress,
    depthRequest: opts.depthRequest,
    experiments: opts.experiments,
  });
  return { ...outcome, meta, allFiles };
}

/**
 * Prepends the configured header to a comment body.
 *
 * After the marker, not before it: `upsertWalkthroughComment` finds its own
 * comment by searching for the marker, and a header is exactly the kind of
 * text someone edits later. Keeping the marker first means the comment stays
 * findable no matter what the header becomes.
 */
function withHeader(config: KomodoConfig, body: string): string {
  const header = config.post.header.trim();
  if (!header) return body;
  if (!body.startsWith(WALKTHROUGH_MARKER)) return `${header}\n\n${body}`;
  return `${WALKTHROUGH_MARKER}\n\n${header}${body.slice(WALKTHROUGH_MARKER.length)}`;
}

function verificationStatus(result: ReviewResult): string {
  const required = result.verificationChecks.filter((check) => check.required).length;
  return required
    ? `Human review required; ${required} result check${required === 1 ? "" : "s"} waiting`
    : "Human review required; AI preflight is ready";
}

/**
 * Decides, for one judgement, whether it can be posted and where.
 *
 * One function behind both `judgementCheck` and `validateJudgements` so the
 * merge step and the final filter cannot disagree about what survives:
 * returns the judgement to keep (its line possibly snapped to a commentable
 * one), or null when it must be dropped.
 */
function keepJudgement(
  files: PRFile[],
  config: KomodoConfig,
): (judgement: Judgement) => Judgement | null {
  const lineIndex = new Map<string, Set<number>>();
  for (const f of files) {
    if (f.patch) lineIndex.set(f.path, commentableLines(f.patch).right);
  }
  return (judgement) => {
    if (SEVERITY_RANK[judgement.severity] < SEVERITY_RANK[config.min_severity]) return null;
    const lines = lineIndex.get(judgement.path);
    if (!lines?.has(judgement.line) || (judgement.endLine !== undefined && !lines.has(judgement.endLine))) {
      // Try to salvage single-line judgements by snapping to the nearest commentable line within 3.
      const snapped = lines ? snapLine(judgement.line, lines) : undefined;
      if (snapped !== undefined && judgement.endLine === undefined) return { ...judgement, line: snapped };
      return null;
    }
    return judgement;
  };
}

/**
 * Whether `validateJudgements` would keep this judgement.
 *
 * Handed to the merge step so that a more severe duplicate which would be
 * dropped later cannot displace a valid judgement that would have been kept.
 */
export function judgementCheck(files: PRFile[], config: KomodoConfig): (judgement: Judgement) => boolean {
  const keep = keepJudgement(files, config);
  return (judgement) => keep(judgement) !== null;
}

/** Drop judgements below min_severity or anchored to lines GitHub can't comment on. */
function validateJudgements(
  result: ReviewResult,
  files: PRFile[],
  config: KomodoConfig,
): { valid: Judgement[]; dropped: Judgement[] } {
  const keep = keepJudgement(files, config);
  const valid: Judgement[] = [];
  const dropped: Judgement[] = [];
  for (const judgement of result.judgements) {
    const kept = keep(judgement);
    if (kept) valid.push(kept);
    else dropped.push(judgement);
  }
  return { valid, dropped };
}

function snapLine(line: number, commentable: Set<number>): number | undefined {
  for (let delta = 1; delta <= 3; delta++) {
    if (commentable.has(line + delta)) return line + delta;
    if (commentable.has(line - delta)) return line - delta;
  }
  return undefined;
}

export function buildReviewRecord(opts: {
  meta: DiffMeta;
  files: DiffFile[];
  result: ReviewResult;
  provider: string;
  model?: string;
}): ReviewRecord {
  const { meta, files, result, provider, model } = opts;
  return {
    version: 3,
    id: `${meta.owner}-${meta.repo}-${meta.number || "local"}-${Date.now()}`,
    createdAt: new Date().toISOString(),
    provider,
    model,
    pr: {
      owner: meta.owner,
      repo: meta.repo,
      number: meta.number,
      title: meta.title,
      author: meta.author,
      url: meta.url,
      baseRef: meta.baseRef,
      headRef: meta.headRef,
      headSha: meta.headSha,
    },
    files: files.map(({ path, additions, deletions, status, patch }) => ({
      path,
      additions,
      deletions,
      status,
      patch,
    })),
    result,
    posted: false,
  };
}

export function saveReviewRecord(record: ReviewRecord, outDir?: string): string {
  const dir = outDir ?? join(process.cwd(), ".komodo", "reviews");
  mkdirSync(dir, { recursive: true });
  const recordPath = join(dir, `${record.id}.json`);
  writeFileSync(recordPath, JSON.stringify(record, null, 2));
  return recordPath;
}
