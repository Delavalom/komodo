import "server-only";

import { GitHubClient, resolveGithubToken, type PRRef } from "@komodo/core";
import type { KomodoStore } from "@komodo/store";

import { getStore } from "@/lib/data/server";
import type { EvidenceKind, VerificationResult } from "@/lib/types";

export interface VerificationSubmission {
  requirementId: string;
  result: VerificationResult;
  evidenceKind: EvidenceKind;
  evidenceUrl?: string | null;
  note?: string | null;
}

const VERIFICATION_RESULTS = new Set<VerificationResult>([
  "verified",
  "failed",
  "blocked",
  "not_applicable",
]);
const EVIDENCE_KINDS = new Set<EvidenceKind>([
  "preview",
  "screenshot",
  "video",
  "test_run",
  "command_output",
  "manual_observation",
]);
const LINK_EVIDENCE = new Set<EvidenceKind>(["preview", "screenshot", "video"]);

/** Validates at the HTTP/action boundary, then appends one attributed result. */
export async function recordVerificationForActor(
  input: VerificationSubmission,
  actorLogin: string,
): Promise<void> {
  const normalized = normalize(input);
  const store = await getStore();
  await store.recordVerification({ ...normalized, actorLogin });

  if ((await store.loadSettings()).useStatusChecks) {
    await updateVerificationStatus(store, input.requirementId).catch((err) => {
      console.warn(
        `Verification was recorded, but the GitHub status could not be updated: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });
  }
}

function normalize(input: VerificationSubmission) {
  if (!VERIFICATION_RESULTS.has(input.result)) {
    throw new Error("Choose a valid verification result.");
  }
  if (!EVIDENCE_KINDS.has(input.evidenceKind)) {
    throw new Error("Choose a valid evidence type.");
  }

  const evidenceUrl = input.evidenceUrl?.trim() || null;
  if (LINK_EVIDENCE.has(input.evidenceKind) && !evidenceUrl) {
    throw new Error("This evidence type needs an http or https link.");
  }
  if (evidenceUrl) {
    let parsed: URL;
    try {
      parsed = new URL(evidenceUrl);
    } catch {
      throw new Error("Evidence links must be valid URLs.");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Evidence links must use http or https.");
    }
  }

  const note = input.note?.trim() || null;
  if (note && note.length > 4_000) {
    throw new Error("Verification notes must be 4,000 characters or fewer.");
  }
  if (!evidenceUrl && !note) {
    throw new Error("Add an evidence link or describe what you observed.");
  }
  if (input.result === "not_applicable" && !note) {
    throw new Error("Explain why this check is not applicable.");
  }

  return { ...input, evidenceUrl, note };
}

async function updateVerificationStatus(
  store: KomodoStore,
  requirementId: string,
): Promise<void> {
  const reviewId = requirementId.split(":verify:")[0];
  const detail = await store.loadReview(reviewId);
  if (!detail) return;

  const latest = new Map(
    detail.verifications.map((entry) => [entry.requirementId, entry]),
  );
  const required = detail.verificationRequirements.filter((check) => check.required);
  const results = required.map((check) => latest.get(check.id)?.result ?? null);
  const state = results.includes("failed")
    ? "failure"
    : results.includes("blocked") || results.some((result) => result !== "verified")
      ? "pending"
      : "success";
  const description =
    state === "success"
      ? "Human evidence recorded; GitHub approval remains separate"
      : state === "failure"
        ? "A required result check failed"
        : "Human verification is still required";

  await new GitHubClient(resolveGithubToken()).postStatus(
    parseReviewId(reviewId),
    detail.review.headSha,
    state,
    description,
  );
}

function parseReviewId(reviewId: string): PRRef {
  const match = /^([^/]+)\/([^#]+)#(\d+)@/.exec(reviewId);
  if (!match) throw new Error(`Not a review id: ${reviewId}`);
  return { owner: match[1], repo: match[2], number: Number(match[3]) };
}
