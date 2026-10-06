import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pc from "picocolors";

import {
  buildReviewRecord,
  effectivePathFilters,
  filterPaths,
  loadConfig,
  LocalGitDiffSource,
  normalizeHost,
  ReviewResultSchema,
  saveReviewRecord,
  type ReviewRecord,
} from "@komodo/core";
import { toFindings, toJudgment, toReview } from "@komodo/ingest";
import { connectStore, isPostgresUrl } from "@komodo/store/connect";

import { readClaimFile, readJson } from "../claim-file.js";
import { readCredentials, RemoteKomodo } from "../remote.js";

/** Validate and commit an interactive agent's result to the claimed job. */
export async function submitCommand(
  claimPath: string,
  resultPath: string,
  opts: { base?: string; apiKey?: string; json?: boolean },
): Promise<void> {
  const claim = readClaimFile(claimPath);
  const raw = (resultPath === "-" ? readStdinJson() : readJson(resolve(resultPath))) as {
    result?: unknown;
  };
  const result = ReviewResultSchema.parse(raw.result ?? raw);

  const record = await buildRecordForClaim(claim, result, opts.base);

  if ("host" in claim) {
    // Normalized here and not only at `claim` time. A claim file is a thing on
    // disk that some other process may have written, and the next line hands a
    // working credential to whatever it names — so the plaintext refusal has to
    // apply to this path too, which is the one where it matters most.
    const host = normalizeHost(claim.host);
    const apiKey = keyForHost(host, opts.apiKey);
    if (!apiKey) {
      throw new Error(
        `No API key for ${host}. Run \`komodo-review login --host ${host} --api-key <key>\`, or pass --api-key.`,
      );
    }
    const remote = new RemoteKomodo(host, apiKey);
    const submitted = await remote.submitClaimed(claim.jobId, claim.workerId, record);

    const recordPath = saveReviewRecord(record);
    reportSubmitted(opts.json, {
      reviewId: submitted.reviewId,
      url: submitted.url,
      recordPath,
    });
    return;
  }

  if (isPostgresUrl(claim.database)) {
    throw new Error(
      "That claim names a Postgres database. Claim again against the deployment's URL instead: `komodo-review claim --host <url>`.",
    );
  }

  const store = await connectStore(claim.database);
  try {
    const judgmentId = await store.upsertJudgment(
      toJudgment(claim.prId, claim.headSha, result),
    );
    const reviewId = await store.saveReview(toReview(claim.prId, record));
    await store.replaceFindings(judgmentId, toFindings(result, reviewId));
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
    reportSubmitted(opts.json, { reviewId, recordPath });
  } finally {
    store.close();
  }
}

/**
 * A ReviewResult piped in, which is how the Claude Code mod hands one over: the
 * tool call's input goes straight to standard input, with no temp file for a
 * second process to find.
 */
function readStdinJson(): unknown {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read a ReviewResult as JSON from standard input: ${detail}`);
  }
}

/** The one place a finished submission is reported, for a person or as one line of JSON. */
function reportSubmitted(
  json: boolean | undefined,
  done: { reviewId: string; url?: string; recordPath: string },
): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(done)}\n`);
    return;
  }
  console.log(pc.green(`Review completed: ${done.reviewId}`));
  if (done.url) console.log(done.url);
  console.log(done.recordPath);
}

/**
 * The record, built here rather than on the deployment.
 *
 * The files and their patches come out of the working tree, and only this side
 * has one — a `komodo serve` holds no checkout of the branch under review. So
 * the agent's machine assembles the record and the deployment validates it,
 * which is also why the head is checked twice: once here, where the message can
 * name the checkout, and again there, where the lease is.
 */
async function buildRecordForClaim(
  claim: { headSha: string; repoId: string; number: number; title: string; author: string; url: string },
  result: ReviewRecord["result"],
  base: string | undefined,
): Promise<ReviewRecord> {
  const { config } = loadConfig();
  const source = new LocalGitDiffSource(process.cwd(), base);
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

  return buildReviewRecord({
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
}

/**
 * A key that is meant for this host, or nothing.
 *
 * The claim names the deployment; the credential has to be one somebody chose
 * for *that* deployment. Three sources, and only one of them is unconditional:
 *
 *   --api-key      the person typed it for this invocation, against this claim
 *   KOMODO_API_KEY only when KOMODO_HOST names the same deployment
 *   the saved login only when it was saved for the same deployment
 *
 * The environment variable used to be taken on its own, which is how a claim
 * file naming any host at all became a way to read a key out of a CI job. It
 * is the documented way to pass a key, so it stays — bound to the host the
 * same variable's companion names.
 */
function keyForHost(host: string, explicit: string | undefined): string | undefined {
  if (explicit?.trim()) return explicit.trim();

  const fromEnv = process.env.KOMODO_API_KEY?.trim();
  const envHost = process.env.KOMODO_HOST?.trim();
  if (fromEnv && envHost && sameHost(envHost, host)) return fromEnv;

  const stored = readCredentials();
  if (stored && sameHost(stored.host, host)) return stored.apiKey;
  return undefined;
}

/** Two spellings of one deployment. Normalized, so a trailing slash is not a different host. */
function sameHost(a: string, b: string): boolean {
  try {
    return normalizeHost(a) === normalizeHost(b);
  } catch {
    return false;
  }
}
