import type { KomodoConfig } from "../config.js";
import type { SharedContextDoc } from "../context-sources.js";
import type { FeatureMap } from "../feature-map.js";
import type { PRFile, PRMeta } from "../github.js";
import type { ReflectInput, ReflectionResult } from "../reflect.js";
import type { Judgement, ReviewResult } from "../schema.js";

/**
 * One thing this team has taught Komodo, selected because it applies here.
 *
 * A plain structural type rather than a store row: core has no dependency on
 * @komodo/store and must not grow one. The ingester matches the rules against
 * the changed paths and hands over what survived — see
 * packages/ingest/src/memory.ts.
 */
export interface ReviewMemory {
  /** The rule as someone wrote it, or the contents of a file they pointed at. */
  text: string;
  /** Where it came from, for the "sources" a judgement has to cite. */
  label: string;
}

/** The three dimensions a thorough review gives a pass of their own. */
export type LensFocus = "architecture" | "scope" | "tests";

/**
 * Which pass of a review this is.
 *
 * `base` is the ordinary review, and the only pass asked for the summary,
 * walkthrough and scores. `lens` asks one question across the whole change.
 * `second-look` is handed everything already raised and asked only for what
 * is missing. See `runPasses` in ../passes.ts.
 */
export type ReviewPass =
  | { kind: "base" }
  | { kind: "lens"; focus: LensFocus }
  | { kind: "second-look"; prior: Judgement[] };

/** What a provider reports about a pass it just ran. */
export interface PassUsage {
  /** In USD, as the provider stated it. Absent when it states nothing. */
  costUsd?: number;
  /**
   * Tokens the pass read, cache reads and writes included, as the provider
   * stated them. Absent when it states nothing. Measured for the benchmark
   * harness (`komodo-review eval aacr`); nothing in the product stores it.
   */
  inputTokens?: number;
  /** Tokens the pass wrote, when the provider states them. */
  outputTokens?: number;
}

/**
 * Set when a review is one bundle of a larger change (experiment `grouping`,
 * see ../grouping.ts). `files` then holds only this bundle's files, and the
 * rest of the pull request is named here so the reviewer knows it exists.
 */
export interface BundleContext {
  /** 1-based position among the bundles. */
  index: number;
  total: number;
  /** Changed files reviewed in other bundles (or with no textual diff). No patches. */
  otherFiles: Pick<PRFile, "path" | "status" | "additions" | "deletions">[];
}

export interface ReviewInput {
  pr: PRMeta;
  /** Files after path filtering, with annotated patches. */
  files: PRFile[];
  config: KomodoConfig;
  /** Local checkout of the PR head, when available — providers with tools can Read/Grep it. */
  repoDir?: string;
  /**
   * The team's own conventions, already narrowed to the ones whose scope
   * matches this pull request. Empty when nothing applies, which is the
   * common case and must read as "no extra rules" rather than as an omission.
   */
  memories?: ReviewMemory[];
  /**
   * Documents from `context.sources` in komodo.yaml, already narrowed to the
   * ones whose scope matches this pull request. Unlike `memories` these can
   * run to thousands of characters each, so they get their own prompt
   * section rather than a bullet — see `buildReviewPrompt`.
   */
  sharedContext?: SharedContextDoc[];
  /**
   * The repository's feature map, read from the checkout at the head — see
   * `readFeatureMap`. Absent when there is no checkout or no map.
   */
  featureMap?: FeatureMap;
  /** Present only under the `grouping` experiment: this review covers one bundle of the change. */
  bundle?: BundleContext;
  /** Which pass this is. Absent means a standard single pass. */
  pass?: ReviewPass;
  /**
   * Eval-only switches, named by `komodo-review eval aacr --experiment`.
   * Never set by a review someone is waiting on, and deliberately not a
   * setting: an experiment that earns its place becomes the default behaviour
   * (or a real setting with a control), not a flag left on in production.
   */
  experiments?: string[];
  /** Agent turns this pass may take, for providers that run an agent loop. */
  turnBudget?: number;
  /**
   * Called with what the pass cost, when the provider reports it. Call it at
   * most once per review call, and call it even if the pass then fails — the
   * cost was still spent.
   */
  onUsage?: (usage: PassUsage) => void;
}

export interface ReviewProvider {
  readonly name: string;
  review(input: ReviewInput, onProgress?: (msg: string) => void): Promise<ReviewResult>;
  /**
   * The `reflect` experiment's call: check finished judgements against the
   * code. Optional, and only ever called when a run opts in with
   * `experiments: ["reflect"]` — see ../reflect.ts.
   */
  reflect?(input: ReflectInput, onProgress?: (msg: string) => void): Promise<ReflectionResult>;
}
