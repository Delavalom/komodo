import { parseReviewResult, reviewResultJsonSchema, type ReviewResult } from "../schema.js";
import { buildReviewPrompt } from "./prompt.js";
import {
  RereadResultSchema,
  buildRereadPrompt,
  rereadJsonSchema,
  type RereadInput,
  type RereadProvider,
  type RereadResult,
} from "./reread.js";
import type { ReviewInput, ReviewProvider } from "./types.js";

export interface OpenRouterUsage {
  promptTokens: number;
  completionTokens: number;
  /** Cost in OpenRouter credits (USD-denominated) actually charged. */
  cost: number;
  generationId: string;
}

/**
 * Diff-based review via OpenRouter chat completions (no repo tools).
 * Used by Komodo Cloud; the caller supplies the API key and model and
 * receives usage/cost for credit accounting.
 */
export class OpenRouterProvider implements ReviewProvider, RereadProvider {
  readonly name = "openrouter";
  lastUsage?: OpenRouterUsage;

  constructor(
    private apiKey: string,
    private model: string,
    private baseUrl = "https://openrouter.ai/api/v1",
  ) {}

  /**
   * One structured-output completion. Returns the call's own usage, and
   * records it on `lastUsage` for callers that make a single call at a time.
   *
   * `onCost` hears the cost the response actually stated — never the 0
   * `usage.cost` falls back to — and hears it before the content is parsed:
   * a reply that is not JSON, or not the schema, was still billed.
   */
  private async complete(
    prompt: string,
    schemaName: string,
    jsonSchema: Record<string, unknown>,
    onCost?: (costUsd: number) => void,
  ): Promise<{ payload: unknown; usage: OpenRouterUsage }> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/Delavalom/komodo",
        "X-Title": "Komodo Code Review",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: "system",
            content:
              "You are Komodo, an AI code review engine. Respond ONLY with JSON matching the provided schema.",
          },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: schemaName, strict: true, schema: jsonSchema },
        },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 400)}`);
    }
    const data = (await res.json()) as any;
    const usage = data.usage ?? {};
    const usageRow: OpenRouterUsage = {
      promptTokens: usage.prompt_tokens ?? 0,
      completionTokens: usage.completion_tokens ?? 0,
      cost: usage.cost ?? 0,
      generationId: data.id ?? "",
    };
    // Kept for callers that read it after a single call. A thorough review
    // runs passes in parallel on one instance, so the pass's own usage is
    // returned rather than read back off a field another pass may overwrite.
    this.lastUsage = usageRow;
    if (typeof usage.cost === "number") onCost?.(usage.cost);
    const content: string = data.choices?.[0]?.message?.content ?? "";
    const jsonStart = content.indexOf("{");
    const jsonEnd = content.lastIndexOf("}");
    if (jsonStart === -1) throw new Error("OpenRouter returned no JSON payload.");
    return {
      payload: JSON.parse(content.slice(jsonStart, jsonEnd + 1)),
      usage: usageRow,
    };
  }

  async review(input: ReviewInput, onProgress?: (msg: string) => void): Promise<ReviewResult> {
    onProgress?.(`Calling ${this.model} via OpenRouter…`);
    const { payload } = await this.complete(
      buildReviewPrompt(input),
      "review_result",
      reviewResultJsonSchema(),
      input.onUsage && ((costUsd) => input.onUsage?.({ costUsd })),
    );
    return parseReviewResult(payload);
  }

  async reread(input: RereadInput): Promise<RereadResult> {
    const { payload } = await this.complete(
      buildRereadPrompt(input),
      "reread_result",
      rereadJsonSchema(),
    );
    return RereadResultSchema.parse(payload);
  }
}
