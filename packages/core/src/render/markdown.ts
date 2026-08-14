import type { KomodoConfig } from "../config.js";
import {
  KIND_LABEL,
  SEVERITY_LABEL,
  SEVERITY_RANK,
  type Judgement,
  type ReviewResult,
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

export function renderJudgementComment(j: Judgement): string {
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
  parts.push(
    `<details>\n<summary>🤖 Prompt for AI agents</summary>\n\n\`\`\`\n${j.fixPrompt}\n\`\`\`\n\n</details>`,
  );
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
