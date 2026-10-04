import {
  SEVERITY_RANK,
  type Judgement,
  type ReviewResult,
  type VerificationCheck,
} from "./schema.js";

/** How many lines apart two judgements can sit and still be one concern. */
const SAME_SPOT = 3;

/**
 * Whether two judgements are the same concern raised twice.
 *
 * Same focus and same file within a few lines, or — for a cross-cutting
 * judgement, which has no line to compare — the same title once case and
 * punctuation are set aside. Deliberately narrow: two passes that disagree
 * about what a line does have both said something worth reading, and merging
 * them would silently lose one.
 */
export function sameConcern(a: Judgement, b: Judgement): boolean {
  if (a.focus !== b.focus || a.path !== b.path) return false;
  if (!a.path) return normalize(a.title) === normalize(b.title);
  return Math.abs(a.line - b.line) <= SAME_SPOT;
}

/**
 * Folds extra passes into the base pass.
 *
 * The base pass owns everything that describes the change as a whole — the
 * summary, the walkthrough, the confidence and effort, the diagram — because
 * it is the only pass asked to write them properly. The extra passes
 * contribute judgements and verification checks, and nothing else. Where two
 * passes raised the same concern, the more severe reading stays.
 */
export function mergeResults(base: ReviewResult, extras: ReviewResult[]): ReviewResult {
  const judgements = [...base.judgements];
  for (const candidate of extras.flatMap((r) => r.judgements)) {
    const at = judgements.findIndex((j) => sameConcern(j, candidate));
    if (at === -1) judgements.push(candidate);
    else if (SEVERITY_RANK[candidate.severity] > SEVERITY_RANK[judgements[at].severity]) {
      judgements[at] = candidate;
    }
  }

  const checks: VerificationCheck[] = [...base.verificationChecks];
  for (const candidate of extras.flatMap((r) => r.verificationChecks)) {
    const at = checks.findIndex((c) => normalize(c.title) === normalize(candidate.title));
    if (at === -1) checks.push(candidate);
    else if (candidate.required && !checks[at].required) {
      checks[at] = { ...checks[at], required: true };
    }
  }

  return { ...base, judgements, verificationChecks: checks };
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
