import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { effectivePathFilters, type KomodoConfig } from "./config.js";
import { commentableLines, filterPaths } from "./diff.js";
import {
  findingToComment,
  GitHubClient,
  type PRFile,
  type PRMeta,
  type PRRef,
} from "./github.js";
import type { ReviewProvider } from "./providers/types.js";
import {
  renderDescriptionBlock,
  renderFindingComment,
  renderReviewBody,
  renderWalkthroughComment,
  sortFindings,
  WALKTHROUGH_MARKER,
} from "./render/markdown.js";
import { SEVERITY_RANK, type Finding, type ReviewRecord, type ReviewResult } from "./schema.js";

export interface RunReviewOptions {
  ref: PRRef;
  provider: ReviewProvider;
  config: KomodoConfig;
  github: GitHubClient;
  /** Local checkout of the PR head for full-repo context. */
  repoDir?: string;
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
  droppedFindings: Finding[];
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

  const result = await provider.review({ pr, files, config, repoDir: opts.repoDir }, onProgress);

  const { valid, dropped } = validateFindings(result, files, config);
  const finalResult: ReviewResult = { ...result, findings: sortFindings(valid) };

  const record: ReviewRecord = {
    version: 1,
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
    posted: post,
  };

  const outDir = opts.outDir ?? join(process.cwd(), ".komodo", "reviews");
  mkdirSync(outDir, { recursive: true });
  const recordPath = join(outDir, `${record.id}.json`);
  writeFileSync(recordPath, JSON.stringify(record, null, 2));

  let reviewUrl: string | undefined;
  if (post) {
    onProgress?.("Posting review to GitHub…");
    const walkthrough = renderWalkthroughComment(pr, finalResult, config);
    await github.upsertWalkthroughComment(ref, WALKTHROUGH_MARKER, walkthrough);

    const comments = finalResult.findings.map((f) => findingToComment(f, renderFindingComment(f)));
    const hasBlocking = finalResult.findings.some((f) => SEVERITY_RANK[f.severity] >= SEVERITY_RANK.major);
    const event =
      hasBlocking && config.post.request_changes ? ("REQUEST_CHANGES" as const) : ("COMMENT" as const);
    let review: { html_url: string };
    try {
      review = await github.postReview(ref, pr.headSha, renderReviewBody(finalResult), event, comments);
    } catch (err) {
      // GitHub rejects REQUEST_CHANGES/APPROVE on the token owner's own PR.
      if (event !== "COMMENT" && err instanceof Error && err.message.includes("own pull request")) {
        review = await github.postReview(ref, pr.headSha, renderReviewBody(finalResult), "COMMENT", comments);
      } else {
        throw err;
      }
    }
    reviewUrl = review.html_url;

    if (config.post.update_description) {
      await github.updateDescription(ref, pr.body, renderDescriptionBlock(finalResult));
    }
    if (config.post.status_check) {
      await github.postStatus(
        ref,
        pr.headSha,
        finalResult.confidence >= 3 ? "success" : "failure",
        `Komodo: ${finalResult.confidence}/5 — ${finalResult.verdict}`,
      );
    }
  }

  return { record, recordPath, reviewUrl, droppedFindings: dropped };
}

/** Drop findings below min_severity or anchored to lines GitHub can't comment on. */
function validateFindings(
  result: ReviewResult,
  files: PRFile[],
  config: KomodoConfig,
): { valid: Finding[]; dropped: Finding[] } {
  const lineIndex = new Map<string, Set<number>>();
  for (const f of files) {
    if (f.patch) lineIndex.set(f.path, commentableLines(f.patch).right);
  }
  const valid: Finding[] = [];
  const dropped: Finding[] = [];
  for (const finding of result.findings) {
    if (SEVERITY_RANK[finding.severity] < SEVERITY_RANK[config.min_severity]) {
      dropped.push(finding);
      continue;
    }
    const lines = lineIndex.get(finding.path);
    if (!lines?.has(finding.line) || (finding.endLine !== undefined && !lines.has(finding.endLine))) {
      // Try to salvage single-line findings by snapping to the nearest commentable line within 3.
      const snapped = lines ? snapLine(finding.line, lines) : undefined;
      if (snapped !== undefined && finding.endLine === undefined) {
        valid.push({ ...finding, line: snapped });
      } else {
        dropped.push(finding);
      }
      continue;
    }
    valid.push(finding);
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
