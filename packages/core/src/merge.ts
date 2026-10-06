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
 * Same focus and same file within a few lines, or — for a cross-cutting or
 * file-level judgement (no path, or line 0, which the schema reserves for "no
 * single changed line owns this") — the same title once case and punctuation
 * are set aside. Deliberately narrow: two passes that disagree
 * about what a line does have both said something worth reading, and merging
 * them would silently lose one.
 */
export function sameConcern(a: Judgement, b: Judgement): boolean {
  if (a.focus !== b.focus || a.path !== b.path) return false;
  if (!a.path || a.line === 0 || b.line === 0) return sameTitle(a.title, b.title);
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
 *
 * A pass is only compared against what came before it — the base and earlier
 * extras — never against its own additions: two distinct findings from one
 * pass that happen to sit near each other are both worth reading.
 *
 * `accept` is the caller's own test for whether a judgement will survive
 * later filtering. Severity decides which reading stays, but never at the
 * price of swapping a judgement that would be kept for one that would be
 * dropped — the concern would vanish from the review entirely.
 */
export function mergeResults(
  base: ReviewResult,
  extras: ReviewResult[],
  accept?: (judgement: Judgement) => boolean,
): ReviewResult {
  const judgements = [...base.judgements];
  for (const extra of extras) {
    const earlier = judgements.length;
    for (const candidate of extra.judgements) {
      const at = judgements.findIndex((j, i) => i < earlier && sameConcern(j, candidate));
      if (at === -1) judgements.push(candidate);
      else if (
        SEVERITY_RANK[candidate.severity] > SEVERITY_RANK[judgements[at].severity] &&
        (!accept || accept(candidate) || !accept(judgements[at]))
      ) {
        judgements[at] = candidate;
      }
    }
  }

  const checks: VerificationCheck[] = [...base.verificationChecks];
  for (const candidate of extras.flatMap((r) => r.verificationChecks)) {
    const at = checks.findIndex((c) => sameTitle(c.title, candidate.title));
    if (at === -1) checks.push(candidate);
    else if (candidate.required && !checks[at].required) {
      checks[at] = { ...checks[at], required: true };
    }
  }

  return { ...base, judgements, verificationChecks: checks };
}

/**
 * Same title once case and punctuation are set aside. A title with no letters
 * or digits at all normalises to nothing and matches nothing, so two blank
 * titles are never taken for one.
 */
function sameTitle(a: string, b: string): boolean {
  const left = normalize(a);
  return left !== "" && left === normalize(b);
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
