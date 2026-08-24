import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pc from "picocolors";
import { z } from "zod";

import {
  buildReviewRecord,
  effectivePathFilters,
  filterPaths,
  loadConfig,
  LocalGitDiffSource,
  ReviewResultSchema,
  saveReviewRecord,
} from "@komodo/core";
import { toFindings, toJudgment, toReview } from "@komodo/ingest";
import { connectStore, isPostgresUrl } from "@komodo/store/connect";

const ClaimSchema = z.object({
  version: z.literal(1),
  database: z.string().min(1),
  workerId: z.string().min(1),
  jobId: z.string().min(1),
  headSha: z.string().min(1),
  prId: z.string().min(1),
  repoId: z.string().min(1),
  number: z.number().int().positive(),
  url: z.string(),
  title: z.string(),
  author: z.string(),
  claimedAt: z.number(),
});

/** Validate and commit an interactive agent's result to the claimed job. */
export async function submitCommand(
  claimPath: string,
  resultPath: string,
  opts: { base?: string },
): Promise<void> {
  const claim = ClaimSchema.parse(readJson(resolve(claimPath)));
  if (isPostgresUrl(claim.database)) {
    throw new Error("Interactive submission only accepts a local SQLite claim.");
  }
  const raw = readJson(resolve(resultPath)) as { result?: unknown };
  const result = ReviewResultSchema.parse(raw.result ?? raw);
  const { config } = loadConfig();
  const source = new LocalGitDiffSource(process.cwd(), opts.base);
  const [localMeta, allFiles] = await Promise.all([
    source.getMeta(),
    source.getFiles(),
  ]);
  if (localMeta.headSha !== claim.headSha) {
    throw new Error(
      `Claimed ${claim.headSha.slice(0, 12)}, but this checkout is ${localMeta.headSha.slice(0, 12)}. Check out the claimed PR head before submitting.`,
    );
  }

  const kept = new Set(
    filterPaths(
      allFiles.map((file) => file.path),
      effectivePathFilters(config),
    ),
  );
  const files = allFiles.filter((file) => kept.has(file.path));
  const [owner, repo] = claim.repoId.split("/");
  if (!owner || !repo) throw new Error(`Invalid repository id in claim: ${claim.repoId}`);

  const record = buildReviewRecord({
    meta: {
      ...localMeta,
      owner,
      repo,
      number: claim.number,
      title: claim.title,
      author: claim.author,
      url: claim.url,
      headSha: claim.headSha,
    },
    files,
    result,
    provider: "claude-skill",
  });

  const store = await connectStore(claim.database);
  try {
    const judgmentId = await store.upsertJudgment(
      toJudgment(claim.prId, claim.headSha, result),
    );
    const reviewId = await store.saveReview(toReview(claim.prId, record));
    await store.replaceFindings(
      judgmentId,
      toFindings(result, reviewId),
    );
    const finished = await store.finishAIReviewJob({
      jobId: claim.jobId,
      workerId: claim.workerId,
      state: "completed",
      finishedAt: Date.now(),
    });
    if (!finished) {
      throw new Error(
        "The claim is no longer owned by this session. The review was stored, but the job was not changed.",
      );
    }

    const recordPath = saveReviewRecord(record);
    console.log(pc.green(`Review completed: ${reviewId}`));
    console.log(recordPath);
  } finally {
    store.close();
  }
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read JSON from ${path}: ${detail}`);
  }
}
