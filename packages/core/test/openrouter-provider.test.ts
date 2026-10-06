import { afterEach, describe, expect, it, vi } from "vitest";

import { KomodoConfigSchema } from "../src/config.js";
import { OpenRouterProvider } from "../src/providers/openrouter.js";

const input = {
  pr: {
    owner: "acme", repo: "api", number: 1, title: "Limits", body: "", author: "dev",
    url: "https://github.com/acme/api/pull/1", baseRef: "main", headRef: "limits",
    headSha: "abc", isDraft: false, labels: [],
  },
  files: [],
  config: KomodoConfigSchema.parse({}),
};

const valid = {
  summary: "- Adds a limiter",
  walkthrough: [],
  confidence: 3,
  verdict: "Read the limiter.",
  effort: 1,
  verificationChecks: [],
  judgements: [],
};

/** Answers every chat completion with the given content and usage. */
function stubFetch(content: unknown, usage: Record<string, number>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: "gen-1",
          usage,
          choices: [{ message: { content: JSON.stringify(content) } }],
        }),
        { status: 200 },
      ),
    ),
  );
}

describe("OpenRouterProvider usage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports the stated cost, even when the payload then fails the schema", async () => {
    stubFetch({ not: "a review" }, { prompt_tokens: 10, completion_tokens: 5, cost: 0.07 });
    const usage: unknown[] = [];
    await expect(
      new OpenRouterProvider("k", "m").review({ ...input, onUsage: (u) => usage.push(u) }),
    ).rejects.toThrow();
    expect(usage).toEqual([{ costUsd: 0.07 }]);
  });

  it("reports nothing when the response states no cost", async () => {
    stubFetch(valid, { prompt_tokens: 10, completion_tokens: 5 });
    const usage: unknown[] = [];
    await new OpenRouterProvider("k", "m").review({ ...input, onUsage: (u) => usage.push(u) });
    expect(usage).toEqual([]);
  });
});
