/**
 * Translating a review into a judgment.
 *
 * @komodo/core speaks in judgements — one question per finding, with a
 * severity and a place in the diff. The queue speaks in an impact
 * and a handful of findings. This is the only place the two vocabularies
 * meet, which keeps the mapping testable without a network or a model.
 */
import type {
  Judgement,
  ReviewRecord,
  ReviewResult,
  Severity as CoreSeverity,
} from "@komodo/core";
import { SEVERITY_RANK } from "@komodo/core";
import type {
  FindingInput,
  ImpactLevel,
  JudgmentInput,
  ReviewInput,
  Severity,
} from "@komodo/store";

/** core has four severities; a finding row has three. trivial folds into P2. */
const SEVERITY: Record<CoreSeverity, Severity> = {
  critical: "P0",
  major: "P1",
  minor: "P2",
  trivial: "P2",
};

const IMPACT: Record<CoreSeverity, ImpactLevel> = {
  critical: "critical",
  major: "high",
  minor: "medium",
  trivial: "low",
};

const IMPACT_RANK: Record<ImpactLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/**
 * Words that make a finding worth flagging as security in the queue, checked
 * against what the reviewer wrote rather than guessed from severity — a
 * critical race condition is not a vulnerability, and a minor one can be.
 */
const SECURITY_TERMS =
  /\b(auth|authz|authn|credential|csrf|escap|injection|leak|permission|priv(ilege)?|secret|security|session|ssrf|token|vulnerab|xss)/i;

export function impactOf(result: ReviewResult): ImpactLevel {
  let worst: ImpactLevel = "low";
  for (const j of result.judgements) {
    const impact = IMPACT[j.severity];
    if (IMPACT_RANK[impact] > IMPACT_RANK[worst]) worst = impact;
  }
  return worst;
}

export function isSecurityFinding(j: ReviewResult["judgements"][number]): boolean {
  return SECURITY_TERMS.test(`${j.tag} ${j.title} ${j.lede} ${j.sourceNote}`);
}

/**
 * Orders the judgements of a run the way the store will number them.
 *
 * `toReview` sorts the postable and dropped sets together by severity and
 * hands the result to `saveReview`, which assigns ordinals by position. So
 * this is the one definition of "which ordinal does this judgement get", and
 * both callers use it rather than each sorting for themselves.
 */
function orderedJudgements(
  result: ReviewResult,
  dropped: Judgement[],
): Judgement[] {
  return [...result.judgements, ...dropped].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
  );
}

/**
 * The queue's summary rows for a run.
 *
 * `reviewId` is optional only because a caller may not have one; passing it
 * links each finding to the judgement it summarises, which is what lets the
 * finding's status follow the answer that judgement gets. Without it the
 * finding is permanently 'open' — correct, but inert.
 */
export function toFindings(
  result: ReviewResult,
  reviewId?: string,
  dropped: Judgement[] = [],
): FindingInput[] {
  // Ordinals are positions in the sorted set, not in the postable one — a
  // finding's own index says nothing about its judgement's id.
  const ordinalOf = new Map<Judgement, number>(
    orderedJudgements(result, dropped).map((j, i) => [j, i]),
  );

  return result.judgements.map((j) => ({
    title: j.title,
    // lede then detail is the order the reviewer wrote them in: consequence
    // first, mechanism second.
    body: [j.lede, j.detail, j.ask].filter(Boolean).join("\n\n"),
    severity: SEVERITY[j.severity],
    isSecurity: isSecurityFinding(j),
    filePath: j.path,
    judgementId:
      reviewId !== undefined && ordinalOf.has(j)
        ? `${reviewId}:${ordinalOf.get(j)}`
        : null,
  }));
}

export function toJudgment(
  prId: string,
  headSha: string,
  result: ReviewResult,
): JudgmentInput {
  const impact = impactOf(result);
  return {
    prId,
    headSha,
    status: "completed",
    score: result.confidence,
    impact,
    // A completed preflight is not a merge verdict. The nullable legacy field
    // stays empty for v3 reviews; GitHub records the human review decision.
    verdict: null,
  };
}

/**
 * The whole review, as Komodo keeps it.
 *
 * `dropped` is the set `runReview` refused to post: judgements below
 * min_severity, or anchored to a line GitHub's review API cannot comment on.
 * They are kept here and marked unpostable, because the reason they were
 * dropped is a property of GitHub's API and not of the judgement. Filtering
 * for GitHub happens when posting; it has no business deciding what this app
 * is allowed to show.
 */
export function toReview(
  prId: string,
  record: ReviewRecord,
  dropped: Judgement[] = [],
): ReviewInput {
  const { result } = record;
  const postable = new Set(result.judgements);

  // Severity order across both sets, so the reader works through the worst
  // first regardless of what GitHub would have accepted. Shared with
  // toFindings, which has to predict the ordinals this produces.
  const all = orderedJudgements(result, dropped);

  return {
    version: 3,
    prId,
    headSha: record.pr.headSha,
    provider: record.provider,
    model: record.model ?? null,
    summary: result.summary,
    walkthrough: result.walkthrough,
    confidence: result.confidence,
    effort: result.effort,
    verdictLine: result.verdict,
    diagram: result.diagram ?? null,
    recordId: record.id,
    files: record.files.map((f) => ({
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
      status: f.status,
      patch: f.patch ?? null,
    })),
    judgements: all.map((j) => ({
      path: j.path,
      line: j.line,
      endLine: j.endLine ?? null,
      severity: j.severity,
      kind: j.kind,
      focus: j.focus,
      tag: j.tag,
      title: j.title,
      lede: j.lede,
      detail: j.detail,
      ask: j.ask,
      sources: j.sources,
      sourceNote: j.sourceNote,
      code: j.code,
      options: j.options,
      suggestion: j.suggestion ?? null,
      fixPrompt: j.fixPrompt,
      postable: postable.has(j),
    })),
    verificationRequirements: result.verificationChecks.map((check) => ({
      title: check.title,
      instruction: check.instruction,
      expectedResult: check.expectedResult,
      evidenceKinds: check.evidenceKinds,
      required: check.required,
    })),
  };
}

/**
 * What to write when a pull request was deliberately passed over.
 *
 * Distinct from `toFailedJudgment` even though the row looks the same: a skip
 * is settled and a failure is not. The work list treats `skipped` as done with
 * this head and `error` as worth another try, so writing the wrong one either
 * loops forever or gives up on a review that was only ever a network blip.
 */
export function toSkippedJudgment(
  prId: string,
  headSha: string,
): JudgmentInput {
  return { prId, headSha, status: "skipped", score: 0, impact: "low", verdict: null };
}

/** What to write when a review could not finish. Keeps the PR in the queue. */
export function toFailedJudgment(
  prId: string,
  headSha: string,
  reason: "error" | "skipped" | "usage_limit",
): JudgmentInput {
  return {
    prId,
    headSha,
    status: reason,
    score: 0,
    impact: "low",
    verdict: null,
  };
}
