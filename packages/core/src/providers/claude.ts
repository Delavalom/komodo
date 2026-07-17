import { query } from "@anthropic-ai/claude-agent-sdk";
import { ReviewResultSchema, reviewResultJsonSchema, type ReviewResult } from "../schema.js";
import { buildReviewPrompt } from "./prompt.js";
import type { ReviewInput, ReviewProvider } from "./types.js";

/**
 * Reviews via the Claude Agent SDK. Auth: reuses the Claude Code login the
 * user created themselves (subscription), or CLAUDE_CODE_OAUTH_TOKEN /
 * ANTHROPIC_API_KEY. Komodo never initiates or stores a login.
 */
export class ClaudeProvider implements ReviewProvider {
  readonly name = "claude";
  constructor(private model?: string) {}

  async review(input: ReviewInput, onProgress?: (msg: string) => void): Promise<ReviewResult> {
    const prompt = buildReviewPrompt(input);
    let structured: unknown;
    let finalText = "";

    for await (const message of query({
      prompt,
      options: {
        ...(this.model ? { model: this.model } : {}),
        cwd: input.repoDir ?? process.cwd(),
        allowedTools: ["Read", "Glob", "Grep"],
        maxTurns: 40,
        systemPrompt:
          "You are Komodo, an AI code review engine. You only read code; you never modify anything. Follow the user's output instructions exactly.",
        outputFormat: { type: "json_schema", schema: reviewResultJsonSchema() },
      } as any,
    })) {
      const m = message as any;
      if (m.type === "assistant" && onProgress) {
        const text = m.message?.content?.find?.((c: any) => c.type === "text")?.text;
        if (text) onProgress(text.slice(0, 120));
      }
      if (m.type === "result") {
        if (m.subtype && m.subtype !== "success") {
          throw new Error(
            `Claude review failed (${m.subtype}). If you are not logged in, run \`claude\` once to sign in, or set ANTHROPIC_API_KEY.`,
          );
        }
        structured = m.structured_output ?? m.structuredOutput;
        finalText = typeof m.result === "string" ? m.result : "";
      }
    }

    const raw = structured ?? extractJson(finalText);
    return ReviewResultSchema.parse(raw);
  }
}

function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Claude returned no JSON review payload.");
  return JSON.parse(candidate.slice(start, end + 1));
}
