import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { effectivePathFilters, type KomodoConfig } from "./config.js";
import { commentableLines, filterPaths } from "./diff.js";
import type { DiffFile, DiffMeta } from "./diff-source.js";
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
  /** Post to GitHub (default true). false = local-only dry run. */
  post?: boolean;
  /** Directory where review JSON records are written (default <cwd>/.komodo/reviews). */
  outDir?: string;
  onProgress?: (msg: string) => void;
  model?: string;
}

export interface RunReviewOutcome {
  record: ReviewRecord;
  recordPath: string;
  reviewUrl?: string;
  droppedJudgements: Judgement[];
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
  const pr = await github.getPR(ref);
  const allFiles = await github.listFiles(ref);

  const keptPaths = new Set(filterPaths(allFiles.map((f) => f.path), effectivePathFilters(config)));
  const files = allFiles.filter((f) => keptPaths.has(f.path));
  onProgress?.(`Reviewing ${files.length}/${allFiles.length} files with ${provider.name}…`);
  if (!files.length) throw new Error("No reviewable files after path filters.");

  const result = await provider.review(
    { pr, files, config, repoDir: opts.repoDir, memories: opts.memories },
    onProgress,
  );

  const { valid, dropped } = validateJudgements(result, files, config);
  const finalResult: ReviewResult = { ...result, judgements: sortJudgements(valid) };

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

  return { record, recordPath, reviewUrl, droppedJudgements: dropped };
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

/** Drop judgements below min_severity or anchored to lines GitHub can't comment on. */
function validateJudgements(
  result: ReviewResult,
  files: PRFile[],
  config: KomodoConfig,
): { valid: Judgement[]; dropped: Judgement[] } {
  const lineIndex = new Map<string, Set<number>>();
  for (const f of files) {
    if (f.patch) lineIndex.set(f.path, commentableLines(f.patch).right);
  }
  const valid: Judgement[] = [];
  const dropped: Judgement[] = [];
  for (const judgement of result.judgements) {
    if (SEVERITY_RANK[judgement.severity] < SEVERITY_RANK[config.min_severity]) {
      dropped.push(judgement);
      continue;
    }
    const lines = lineIndex.get(judgement.path);
    if (!lines?.has(judgement.line) || (judgement.endLine !== undefined && !lines.has(judgement.endLine))) {
      // Try to salvage single-line judgements by snapping to the nearest commentable line within 3.
      const snapped = lines ? snapLine(judgement.line, lines) : undefined;
      if (snapped !== undefined && judgement.endLine === undefined) {
        valid.push({ ...judgement, line: snapped });
      } else {
        dropped.push(judgement);
      }
      continue;
    }
    valid.push(judgement);
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
