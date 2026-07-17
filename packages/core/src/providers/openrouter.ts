import { ReviewResultSchema, reviewResultJsonSchema, type ReviewResult } from "../schema.js";
import { buildReviewPrompt } from "./prompt.js";
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
export class OpenRouterProvider implements ReviewProvider {
  readonly name = "openrouter";
  lastUsage?: OpenRouterUsage;

  constructor(
    private apiKey: string,
    private model: string,
    private baseUrl = "https://openrouter.ai/api/v1",
  ) {}

  async review(input: ReviewInput, onProgress?: (msg: string) => void): Promise<ReviewResult> {
    onProgress?.(`Calling ${this.model} via OpenRouter…`);
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
          { role: "user", content: buildReviewPrompt(input) },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "review_result", strict: true, schema: reviewResultJsonSchema() },
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
    if (jsonStart === -1) throw new Error("OpenRouter returned no JSON review payload.");
    return ReviewResultSchema.parse(JSON.parse(content.slice(jsonStart, jsonEnd + 1)));
  }
}
