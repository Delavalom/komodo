import { query } from "@anthropic-ai/claude-agent-sdk";
import {
  buildReflectionPrompt,
  REFLECT_DEFAULT_TURNS,
  ReflectionResultSchema,
  reflectionJsonSchema,
  type ReflectInput,
  type ReflectionResult,
} from "../reflect.js";
import { parseReviewResult, reviewResultJsonSchema, type ReviewResult } from "../schema.js";
import { pinEnabled } from "../pin.js";
import { buildReviewPrompt } from "./prompt.js";
import type { PassUsage, ReviewInput, ReviewProvider } from "./types.js";

/**
 * Reviews via the Claude Agent SDK. Auth: reuses the Claude Code login the
 * user created themselves (subscription), or CLAUDE_CODE_OAUTH_TOKEN /
 * ANTHROPIC_API_KEY. Komodo never initiates or stores a login.
 */
export class ClaudeProvider implements ReviewProvider {
  readonly name = "claude";
  private readonly model?: string;
  private readonly executable?: string;

  constructor(options: string | { model?: string; executable?: string } = {}) {
    // Keep the old string constructor source-compatible for embedders while
    // giving Komodo a place to pass the managed enterprise launcher.
    if (typeof options === "string") this.model = options;
    else {
      this.model = options.model;
      this.executable = options.executable;
    }
  }

  async review(input: ReviewInput, onProgress?: (msg: string) => void): Promise<ReviewResult> {
    const prompt = buildReviewPrompt(input);
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
        maxTurns: input.turnBudget ?? 40,
        systemPrompt:
          "You are Komodo, an AI code review engine. You only read code; you never modify anything. Follow the user's output instructions exactly.",
        outputFormat: { type: "json_schema", schema: reviewResultJsonSchema({ anchor: pinEnabled(input.experiments) }) },
      } as any,
    })) {
      const m = message as any;
      if (m.type === "assistant" && onProgress) {
        const text = m.message?.content?.find?.((c: any) => c.type === "text")?.text;
        if (text) onProgress(text.slice(0, 120));
      }
      if (m.type === "result") {
        // The SDK states a cost on every result, including one that then
        // failed (a pass that runs out of turns still spent them), so it is
        // reported before the failure check. On a subscription the figure is
        // what the run would have cost on the API, which is still the honest
        // number to compare depths by.
        const usage = resultUsage(m);
        if (Object.keys(usage).length) input.onUsage?.(usage);
        if (m.subtype && m.subtype !== "success") {
          throw new Error(
            `Claude review failed (${m.subtype})${
              this.executable ? ` through ${this.executable}` : ""
            }. Verify the approved launcher with \`komodo-review doctor claude\`.`,
          );
        }
        structured = m.structured_output ?? m.structuredOutput;
        finalText = typeof m.result === "string" ? m.result : "";
      }
    }

    const raw = structured ?? extractJson(finalText);
    return parseReviewResult(raw);
  }

  /**
   * The `reflect` experiment's call. Same SDK, same model, same read-only
   * tools and checkout as `review`; it differs in the prompt and the schema.
   */
  async reflect(input: ReflectInput, onProgress?: (msg: string) => void): Promise<ReflectionResult> {
    const prompt = buildReflectionPrompt(input);
    let structured: unknown;
    let finalText = "";

    for await (const message of query({
      prompt,
      options: {
        ...(this.model ? { model: this.model } : {}),
        ...(this.executable ? { pathToClaudeCodeExecutable: this.executable } : {}),
        cwd: input.repoDir ?? process.cwd(),
        allowedTools: ["Read", "Glob", "Grep"],
        maxTurns: input.turnBudget ?? REFLECT_DEFAULT_TURNS,
        systemPrompt:
          "You are Komodo's second reader. You only read code; you never modify anything. You check drafted review judgements against the code and follow the user's output instructions exactly.",
        outputFormat: { type: "json_schema", schema: reflectionJsonSchema() },
      } as any,
    })) {
      const m = message as any;
      if (m.type === "assistant" && onProgress) {
        const text = m.message?.content?.find?.((c: any) => c.type === "text")?.text;
        if (text) onProgress(text.slice(0, 120));
      }
      if (m.type === "result") {
        // Reported before the failure check, like a review: a call that ran
        // out of turns still spent them.
        const usage: { costUsd?: number; inputTokens?: number; outputTokens?: number } = {};
        if (typeof m.total_cost_usd === "number") usage.costUsd = m.total_cost_usd;
        if (typeof m.usage?.input_tokens === "number") usage.inputTokens = m.usage.input_tokens;
        if (typeof m.usage?.output_tokens === "number") usage.outputTokens = m.usage.output_tokens;
        input.onUsage?.(usage);
        if (m.subtype && m.subtype !== "success") {
          throw new Error(`Claude reflection failed (${m.subtype}).`);
        }
        structured = m.structured_output ?? m.structuredOutput;
        finalText = typeof m.result === "string" ? m.result : "";
      }
    }

    return ReflectionResultSchema.parse(structured ?? extractJson(finalText));
  }

  /**
   * Exercises the same SDK child-process path as a real review without
   * sending repository data. `--version` alone only proves the launcher can
   * start; this proves its proxy, authentication, and Agent SDK session work.
   */
  async healthCheck(): Promise<string> {
    for await (const message of query({
      prompt: "Reply with the single word OK.",
      options: {
        ...(this.model ? { model: this.model } : {}),
        ...(this.executable
          ? { pathToClaudeCodeExecutable: this.executable }
          : {}),
        allowedTools: [],
        maxTurns: 1,
        systemPrompt:
          "This is a connectivity check. Do not use tools. Reply with OK.",
      } as any,
    })) {
      const result = message as any;
      if (result.type !== "result") continue;
      if (!result.subtype || result.subtype === "success") {
        return typeof result.result === "string" ? result.result.trim() : "OK";
      }
      throw new Error(
        `Claude connectivity check failed (${result.subtype})${
          this.executable ? ` through ${this.executable}` : ""
        }.`,
      );
    }
    throw new Error("Claude connectivity check ended without a result.");
  }
}

/**
 * Cost and tokens off an SDK result message. Tokens come from `modelUsage`,
 * which covers every model call the query made (subagents included), and
 * count cache reads and writes as input — the same accounting AACR-Bench uses
 * for its Claude reviewer, so token figures compare across reviewers.
 */
export function resultUsage(m: any): PassUsage {
  const usage: PassUsage = {};
  if (typeof m.total_cost_usd === "number") usage.costUsd = m.total_cost_usd;
  const models = m.modelUsage && typeof m.modelUsage === "object" ? Object.values(m.modelUsage) : [];
  if (models.length) {
    let input = 0;
    let output = 0;
    for (const u of models as any[]) {
      input += (u.inputTokens ?? 0) + (u.cacheReadInputTokens ?? 0) + (u.cacheCreationInputTokens ?? 0);
      output += u.outputTokens ?? 0;
    }
    usage.inputTokens = input;
    usage.outputTokens = output;
  }
  return usage;
}

function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Claude returned no JSON review payload.");
  return JSON.parse(candidate.slice(start, end + 1));
}
