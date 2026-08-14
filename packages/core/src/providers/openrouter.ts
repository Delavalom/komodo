import { ReviewResultSchema, reviewResultJsonSchema, type ReviewResult } from "../schema.js";
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
   * One structured-output completion. Records usage on `lastUsage` so the
   * caller can charge credits for whatever it just asked for.
   */
  private async complete(
    prompt: string,
    schemaName: string,
    jsonSchema: Record<string, unknown>,
  ): Promise<unknown> {
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
    this.lastUsage = {
      promptTokens: usage.prompt_tokens ?? 0,
      completionTokens: usage.completion_tokens ?? 0,
      cost: usage.cost ?? 0,
      generationId: data.id ?? "",
    };
    const content: string = data.choices?.[0]?.message?.content ?? "";
    const jsonStart = content.indexOf("{");
    const jsonEnd = content.lastIndexOf("}");
    if (jsonStart === -1) throw new Error("OpenRouter returned no JSON payload.");
    return JSON.parse(content.slice(jsonStart, jsonEnd + 1));
  }

  async review(input: ReviewInput, onProgress?: (msg: string) => void): Promise<ReviewResult> {
    onProgress?.(`Calling ${this.model} via OpenRouter…`);
    return ReviewResultSchema.parse(
      await this.complete(buildReviewPrompt(input), "review_result", reviewResultJsonSchema()),
    );
  }

  async reread(input: RereadInput): Promise<RereadResult> {
    return RereadResultSchema.parse(
      await this.complete(buildRereadPrompt(input), "reread_result", rereadJsonSchema()),
    );
  }
}
