import { query } from "@anthropic-ai/claude-agent-sdk";
import {
  WatchTriageResultSchema,
  watchTriageResultJsonSchema,
  type WatchTriageResult,
} from "../schema.js";

/**
 * Just what the triage prompt needs to name the pull request. Deliberately
 * not `PRMeta`: the ingester only has the store's own `PullRequest` row here,
 * which carries no base/head ref or body, and fetching a fresh `PRMeta` per
 * triaged comment would be a GitHub call this pass has no other reason to
 * make.
 */
export interface WatchTriagePr {
  title: string;
  number: number;
  url: string;
  author: string;
}

export interface WatchTriageComment {
  author: string;
  body: string;
  path: string | null;
  line: number | null;
}

export interface WatchTriageInput {
  pr: WatchTriagePr;
  comment: WatchTriageComment;
  /** Local checkout of the PR head, when available — same as ReviewInput. */
  repoDir?: string;
  /** True when the watch is `notify_and_draft` — asks for draftResponse too. */
  wantDraft: boolean;
}

export interface WatchTriageProvider {
  readonly name: string;
  triage(input: WatchTriageInput): Promise<WatchTriageResult>;
}

/**
 * Triages one comment on a watched pull request via the Claude Agent SDK.
 *
 * A separate small interface from `ReviewProvider` rather than a second
 * method on it: this takes one comment, not a diff, and returns a verdict,
 * not a review. Read-only tools only, same as a review — this call can never
 * write code or reach GitHub, by construction, which is what keeps a watcher
 * on the right side of AGENTS.md rule 15 without a special case.
 */
export class ClaudeWatchTriage implements WatchTriageProvider {
  readonly name = "claude";
  private readonly model?: string;
  private readonly executable?: string;

  constructor(options: { model?: string; executable?: string } = {}) {
    this.model = options.model;
    this.executable = options.executable;
  }

  async triage(input: WatchTriageInput): Promise<WatchTriageResult> {
    const prompt = buildTriagePrompt(input);
    let structured: unknown;
    let finalText = "";

    for await (const message of query({
      prompt,
      options: {
        ...(this.model ? { model: this.model } : {}),
        ...(this.executable
          ? { pathToClaudeCodeExecutable: this.executable }
          : {}),
        cwd: input.repoDir ?? process.cwd(),
        allowedTools: ["Read", "Glob", "Grep"],
        // A verdict on one comment needs far less exploration than a full
        // review of the diff.
        maxTurns: 10,
        systemPrompt:
          "You are Komodo's PR watcher. You only read code; you never modify anything. " +
          "You decide whether a pull-request comment is worth a person's attention, and, " +
          "when asked, draft a suggested reply. You never suggest posting anything yourself.",
        outputFormat: { type: "json_schema", schema: watchTriageResultJsonSchema() },
      } as any,
    })) {
      const m = message as any;
      if (m.type === "result") {
        if (m.subtype && m.subtype !== "success") {
          throw new Error(`Claude triage failed (${m.subtype}).`);
        }
        structured = m.structured_output ?? m.structuredOutput;
        finalText = typeof m.result === "string" ? m.result : "";
      }
    }

    const raw = structured ?? extractJson(finalText);
    return WatchTriageResultSchema.parse(raw);
  }
}

function buildTriagePrompt(input: WatchTriageInput): string {
  const { pr, comment } = input;
  const anchor = comment.path
    ? `on ${comment.path}${comment.line ? `:${comment.line}` : ""}`
    : "on the pull request itself";
  return [
    `Pull request #${pr.number}: ${pr.title} (${pr.url})`,
    `New comment from ${comment.author}, ${anchor}:`,
    "",
    comment.body,
    "",
    input.wantDraft
      ? "Decide whether this is worth addressing, and if so draft a short suggested reply " +
        "and, when it implies a code change, a prose summary of what that change would be. " +
        "Use the checkout at cwd to ground your answer in the real code."
      : "Decide whether this is worth addressing. Leave draftResponse and draftPatchSummary null.",
  ].join("\n");
}

function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Claude returned no JSON triage payload.");
  return JSON.parse(candidate.slice(start, end + 1));
}
