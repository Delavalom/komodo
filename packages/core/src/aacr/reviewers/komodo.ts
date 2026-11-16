import { KomodoConfigSchema, type KomodoConfig } from "../../config.js";
import type { ReviewDepth } from "../../depth.js";
import { NoReviewableFilesError, runLocalReview } from "../../pipeline.js";
import { ClaudeProvider } from "../../providers/claude.js";
import { resolveClaudeExecutable } from "../../providers/index.js";
import type { ReviewProvider } from "../../providers/types.js";
import type { Judgement } from "../../schema.js";
import type { CommentDetail, GeneratedComment, Reviewer, ReviewerRun } from "../types.js";

export interface KomodoReviewerOptions {
  /** Defaults to a Claude provider on `model`. Tests hand in a fake. */
  provider?: ReviewProvider;
  /**
   * The reviewer's configuration. Defaults to Komodo's defaults, not the
   * komodo.yaml of wherever the command runs — a benchmark score should not
   * depend on which checkout it was started from.
   */
  config?: KomodoConfig;
  model?: string;
  depth?: ReviewDepth;
  experiments?: string[];
  onProgress?: (instanceId: string, msg: string) => void;
}

/** What the judge reads of a judgement: its sentence, its lede and its detail. */
export function judgementToGenerated(j: Judgement): GeneratedComment {
  return {
    path: j.path,
    fromLine: j.line,
    toLine: j.endLine ?? j.line,
    body: [j.title, j.lede, j.detail].map((s) => s.trim()).filter(Boolean).join("\n\n"),
  };
}

/** The judgement facts a run can later be re-scored on. */
export function judgementDetail(j: Judgement): CommentDetail {
  return { focus: j.focus, kind: j.kind, severity: j.severity };
}

/**
 * Komodo's own preflight as a benchmark reviewer: `runLocalReview` on
 * `base...head` of the prepared checkout — the same passes, merge and
 * `validateJudgements` filter a pull request gets — with the checkout as the
 * provider's working directory so its tools read the repository. Every kept
 * judgement becomes one generated comment; what the filter dropped is not
 * shown to a person, so it is not scored either.
 *
 * A change with nothing left after path filters is an empty review, not a
 * failure: Komodo would post nothing on it, and that is what gets scored.
 */
export function createKomodoReviewer(opts: KomodoReviewerOptions = {}): Reviewer {
  const config = opts.config ?? KomodoConfigSchema.parse({});
  if (opts.model) config.model = opts.model;
  const provider =
    opts.provider ??
    new ClaudeProvider({ model: config.model, executable: resolveClaudeExecutable(config) });
  const depth = opts.depth ?? "standard";

  return {
    name: "komodo",
    async review(instance, repoPath): Promise<ReviewerRun> {
      const started = performance.now();
      const seconds = () => (performance.now() - started) / 1000;
      const base: Omit<ReviewerRun, "durationSeconds"> = {
        instanceId: instance.id,
        reviewer: "komodo",
        comments: [],
      };
      try {
        const out = await runLocalReview({
          repoDir: repoPath,
          base: instance.baseCommit,
          head: instance.headCommit,
          provider,
          config,
          depthRequest: { depth, by: "eval" },
          experiments: opts.experiments?.length ? opts.experiments : undefined,
          onProgress: opts.onProgress && ((m) => opts.onProgress?.(instance.id, m)),
        });
        return {
          ...base,
          comments: out.result.judgements.map(judgementToGenerated),
          details: out.result.judgements.map(judgementDetail),
          hidden: out.dropped.map((j) => ({
            ...judgementToGenerated(j),
            ...judgementDetail(j),
            reason: j.droppedBy === "reflect" ? `reflect: ${j.dropReason ?? ""}`.trim() : "filtered",
          })),
          durationSeconds: seconds(),
          ...(out.passRun.inputTokens !== null ? { inputTokens: out.passRun.inputTokens } : {}),
          ...(out.passRun.outputTokens !== null ? { outputTokens: out.passRun.outputTokens } : {}),
          costUsd: out.passRun.costUsd,
        };
      } catch (err) {
        if (err instanceof NoReviewableFilesError) {
          return { ...base, durationSeconds: seconds(), inputTokens: 0, outputTokens: 0, costUsd: 0 };
        }
        return { ...base, durationSeconds: seconds(), error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
