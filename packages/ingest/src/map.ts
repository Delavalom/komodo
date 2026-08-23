/**
 * Translating a review into a judgment.
 *
 * @komodo/core speaks in judgements — one question per finding, with a
 * severity and a place in the diff. The queue speaks in a verdict, an impact
 * and a handful of findings. This is the only place the two vocabularies
 * meet, which keeps the mapping testable without a network or a model.
 */
import type { ReviewResult, Severity as CoreSeverity } from "@komodo/core";
import { verdictFor } from "@komodo/store";
import type {
  FindingInput,
  ImpactLevel,
  JudgmentInput,
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

export function toFindings(result: ReviewResult): FindingInput[] {
  return result.judgements.map((j) => ({
    title: j.title,
    // lede then detail is the order the reviewer wrote them in: consequence
    // first, mechanism second.
    body: [j.lede, j.detail, j.ask].filter(Boolean).join("\n\n"),
    severity: SEVERITY[j.severity],
    isSecurity: isSecurityFinding(j),
    filePath: j.path,
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
    verdict: verdictFor("completed", result.confidence, impact),
  };
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
