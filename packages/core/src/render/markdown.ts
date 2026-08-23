import type { KomodoConfig } from "../config.js";
import {
  KIND_LABEL,
  SEVERITY_LABEL,
  SEVERITY_RANK,
  type Judgement,
  type ReviewResult,
  type Severity,
} from "../schema.js";
import type { PRMeta } from "../github.js";

export const WALKTHROUGH_MARKER = "<!-- komodo-walkthrough -->";

function section(title: string, body: string, collapsible: boolean, open: boolean): string {
  if (!collapsible) return `## ${title}\n\n${body}`;
  return `<details${open ? " open" : ""}>\n<summary><b>${title}</b></summary>\n\n${body}\n\n</details>`;
}

function confidenceBadge(confidence: number): string {
  const bar = "🟩".repeat(confidence) + "⬜".repeat(5 - confidence);
  return `${bar} **${confidence}/5**`;
}

export function renderWalkthroughComment(pr: PRMeta, result: ReviewResult, config: KomodoConfig): string {
  const parts: string[] = [WALKTHROUGH_MARKER, `# 🦎 Komodo Review`];
  const m = config.modules;

  if (m.confidence.enabled) {
    const grouped = countBySeverity(result.judgements);
    const judgementsLine = result.judgements.length
      ? Object.entries(grouped)
          .map(([sev, n]) => `${SEVERITY_LABEL[sev as keyof typeof SEVERITY_LABEL]}: ${n}`)
          .join(" · ")
      : "Nothing to judge";
    parts.push(
      `${confidenceBadge(result.confidence)} — ${result.verdict}\n\n` +
        `**Review effort:** ${result.effort}/5 · **Judgements:** ${judgementsLine}`,
    );
  }

  if (m.summary.enabled) {
    parts.push(section("Summary", result.summary, m.summary.collapsible, m.summary.defaultOpen));
  }

  if (m.walkthrough.enabled && result.walkthrough.length) {
    const rows = result.walkthrough
      .map((w) => `| ${w.files.map((f) => `\`${f}\``).join("<br>")} | ${w.summary.replace(/\n/g, " ")} |`)
      .join("\n");
    const table = `| Files | Change summary |\n|---|---|\n${rows}`;
    parts.push(section("Walkthrough", table, m.walkthrough.collapsible, m.walkthrough.defaultOpen));
  }

  if (m.diagram.enabled && result.diagram) {
    const mermaid = `\`\`\`mermaid\n${result.diagram}\n\`\`\``;
    parts.push(section("Sequence diagram", mermaid, m.diagram.collapsible, m.diagram.defaultOpen));
  }

  parts.push(
    `<sub>Reviewed by <a href="https://github.com/Delavalom/komodo">Komodo</a> on your own subscription · ` +
      `head <code>${pr.headSha.slice(0, 7)}</code></sub>`,
  );
  return parts.join("\n\n");
}

/**
 * The receipt: what GitHub gets when the review lives in Komodo.
 *
 * One comment, and deliberately not a review. It states the call and says
 * where the judgements are, because a judgement is a question with four
 * answers and GitHub has nowhere to put one — flattening it into a comment
 * thread loses the thing that makes it a decision rather than a remark.
 */
export function renderReceipt(
  pr: PRMeta,
  result: ReviewResult,
  reviewUrl: string,
): string {
  const n = result.judgements.length;
  const counts = countBySeverity(result.judgements);
  const breakdown = Object.entries(counts)
    .map(([sev, count]) => `${SEVERITY_LABEL[sev as Severity]}: ${count}`)
    .join(" · ");

  return [
    WALKTHROUGH_MARKER,
    `### 🦎 Komodo reviewed this`,
    `${confidenceBadge(result.confidence)} — ${result.verdict}`,
    n
      ? `**${n} judgement${n > 1 ? "s" : ""}** waiting on a human — ${breakdown}\n\n` +
        `Each one is a question with four ways to answer it.\n\n` +
        `**[Answer them in Komodo →](${reviewUrl})**`
      : `Nothing here needed a decision. [See the review →](${reviewUrl})`,
    `<sub>Reviewed on your own subscription · head <code>${pr.headSha.slice(0, 7)}</code></sub>`,
  ].join("\n\n");
}

/**
 * What a decided review looks like on the pull request.
 *
 * The counterpart to `renderReceipt`, and deliberately the same comment: the
 * receipt says judgements are waiting, and once they are answered this
 * replaces it in place, so the one Komodo comment on a pull request always
 * says where the review currently stands rather than where it started.
 *
 * The input is structural rather than a store type. `@komodo/store`
 * re-declares this vocabulary instead of importing it, and core must not
 * acquire the reverse dependency — so the caller maps its own rows onto this.
 */
export interface Outcome {
  headSha: string;
  confidence: number;
  verdictLine: string;
  /** Bucket totals, in the order they should be read. Zeroes are dropped. */
  tally: { bucket: string; count: number }[];
  /** The items worth naming: what blocks, and what was asked. */
  decisions: { bucket: string; title: string; note: string | null }[];
  unanswered: number;
}

export function renderOutcome(outcome: Outcome, reviewUrl: string): string {
  const { tally, decisions, unanswered } = outcome;
  const answered = tally.reduce((sum, t) => sum + t.count, 0);
  const blocking = decisions.filter((d) => d.bucket === "Blocks");
  const asked = decisions.filter((d) => d.bucket === "Asked");

  const parts: string[] = [
    WALKTHROUGH_MARKER,
    `### 🦎 Komodo review answered`,
    `${confidenceBadge(outcome.confidence)} — ${outcome.verdictLine}`,
  ];

  parts.push(
    answered
      ? tally.map((t) => `**${t.bucket}:** ${t.count}`).join(" · ")
      : "Nothing here has been answered yet.",
  );

  // Naming these two is the point of the comment. A count says a review
  // happened; the titles say what someone has to do about it.
  if (blocking.length) {
    parts.push(
      [`**Blocking:**`, ...blocking.map((d) => `- ${strip(d.title)}`)].join("\n"),
    );
  }
  if (asked.length) {
    parts.push(
      [
        `**Questions for the author:**`,
        ...asked.map((d) => `- ${strip(d.title)}${d.note ? ` — ${d.note}` : ""}`),
      ].join("\n"),
    );
  }
  if (unanswered) {
    parts.push(
      `${unanswered} judgement${unanswered > 1 ? "s are" : " is"} still unanswered.`,
    );
  }

  parts.push(`**[See the review →](${reviewUrl})**`);
  parts.push(
    `<sub>Answered in Komodo · head <code>${outcome.headSha.slice(0, 7)}</code></sub>`,
  );
  return parts.join("\n\n");
}

/** Judgement titles are written as sentences; a bullet does not want the stop. */
function strip(title: string): string {
  return title.replace(/\.$/, "");
}

/**
 * One judgement as an inline comment on the diff.
 *
 * `includeFixPrompt` defaults on so a caller that has no config — the CLI's
 * local render, the tests — keeps the behaviour it always had.
 */
export function renderJudgementComment(
  j: Judgement,
  includeFixPrompt = true,
): string {
  const parts: string[] = [
    `**${SEVERITY_LABEL[j.severity]} · ${KIND_LABEL[j.kind]}** — ${j.tag}`,
    `**${j.title}**`,
    j.lede,
    j.detail,
    `> **The question:** ${j.ask}`,
    `<sub>Read from ${j.sources.join(", ")}. ${j.sourceNote}</sub>`,
  ];
  if (j.suggestion) {
    parts.push(`\`\`\`suggestion\n${j.suggestion}\n\`\`\``);
  }
  if (includeFixPrompt) {
    parts.push(
      `<details>\n<summary>🤖 Prompt for AI agents</summary>\n\n\`\`\`\n${j.fixPrompt}\n\`\`\`\n\n</details>`,
    );
  }
  return parts.join("\n\n");
}

export function renderReviewBody(result: ReviewResult): string {
  if (!result.judgements.length) {
    return `🦎 **Komodo** found nothing worth judging. ${result.verdict}`;
  }
  const counts = countBySeverity(result.judgements);
  const summary = Object.entries(counts)
    .map(([sev, n]) => `${n} ${sev}`)
    .join(", ");
  const n = result.judgements.length;
  return `🦎 **Komodo** raised ${n} judgement${n > 1 ? "s" : ""} (${summary}). Each inline comment states what was decided and the question it puts to you.`;
}

export function renderDescriptionBlock(result: ReviewResult): string {
  return `## Summary by Komodo\n\n${result.summary}`;
}

export function sortJudgements(judgements: Judgement[]): Judgement[] {
  return [...judgements].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
}

function countBySeverity(judgements: Judgement[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const j of sortJudgements(judgements)) {
    out[j.severity] = (out[j.severity] ?? 0) + 1;
  }
  return out;
}
