import { annotatePatch } from "../diff.js";
import type { ReviewInput } from "./types.js";

export function buildReviewPrompt(input: ReviewInput): string {
  const { pr, files, config } = input;
  const profileNote =
    config.profile === "assertive"
      ? "Be thorough and opinionated: also flag maintainability and style issues worth fixing."
      : "Be focused: only report findings a senior reviewer would actually block or comment on. Skip nitpicks.";

  const pathInstructions = config.path_instructions.length
    ? `\n## Per-path review instructions\n${config.path_instructions
        .map((pi) => `- Files matching \`${pi.path}\`: ${pi.instructions}`)
        .join("\n")}`
    : "";

  const custom = config.instructions ? `\n## Repository instructions\n${config.instructions}` : "";

  const diffs = files
    .map((f) => {
      const header = `### ${f.path} (${f.status}, +${f.additions}/-${f.deletions})`;
      if (!f.patch) return `${header}\n(no textual diff — binary or too large)`;
      return `${header}\n\`\`\`diff\n${annotatePatch(f.patch)}\n\`\`\``;
    })
    .join("\n\n");

  return `You are Komodo, an expert AI code reviewer. Review this pull request like a principal engineer who cares about what actually matters: correctness, security, data integrity, and whether this change is safe to merge.

${profileNote}

## Pull request
- Repo: ${pr.owner}/${pr.repo}
- #${pr.number}: ${pr.title}
- Author: ${pr.author} | ${pr.baseRef} ← ${pr.headRef}

### Description
${pr.body || "(empty)"}
${custom}${pathInstructions}

## Diff
Each diff line is prefixed with its line number in the NEW version of the file. Findings MUST cite one of these numbers (added "+" lines strongly preferred).

${diffs}

## Your job
1. If a repository checkout is available to you, read surrounding code for any file where the diff alone is ambiguous — trace callers and check how changed functions are used elsewhere before claiming a bug.
2. Produce the review as structured output:
   - summary: markdown bullets grouped by change type
   - walkthrough: group RELATED files into single rows (e.g. one source change + its locale/test churn = separate rows, each with a plain-language summary)
   - confidence: 0-5 merge-confidence (5 = ready to merge) + one-line verdict
   - effort: 1-5 estimated human review effort
   - diagram: mermaid sequenceDiagram ONLY if the PR changes a multi-component flow
   - findings: real defects and risks. Each must cite a line number from the annotated diff, carry severity (critical|major|minor|trivial) and category, explain the concrete failure scenario, and include a "suggestion" (replacement code for exactly the cited line range) when a safe mechanical fix exists. fixPrompt = a self-contained instruction for a coding agent.
3. Report only findings at or above severity "${config.min_severity}". Do not pad — an empty findings list is a valid review. Never invent line numbers.`;
}
