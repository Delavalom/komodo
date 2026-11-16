import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  calls: [] as Array<{ prompt: string; options: Record<string, unknown> }>,
  subtype: "success" as string,
}));

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: (args: { prompt: string; options: Record<string, unknown> }) => {
    sdk.calls.push(args);
    return (async function* () {
      yield {
        type: "result",
        subtype: sdk.subtype,
        total_cost_usd: 0.07,
        usage: { input_tokens: 1200, output_tokens: 80 },
        structured_output: {
          verdicts: [{ id: "j-0", analysis: "a", verdict: "keep", reason: "holds", revision: null }],
        },
      };
    })();
  },
}));

import { KomodoConfigSchema } from "../src/config.js";
import { ClaudeProvider } from "../src/providers/claude.js";

const input = {
  pr: {
    owner: "acme", repo: "api", number: 1, title: "Limits", body: "", author: "dev",
    url: "u", baseRef: "main", headRef: "limits", headSha: "abc", isDraft: false, labels: [],
  },
  files: [],
  judgements: [],
  config: KomodoConfigSchema.parse({}),
  repoDir: "/work/checkout",
};

describe("ClaudeProvider.reflect", () => {
  beforeEach(() => {
    sdk.calls.length = 0;
    sdk.subtype = "success";
  });

  it("reads the checkout with the same read-only tools a review has", async () => {
    await new ClaudeProvider({ model: "m" }).reflect(input);
    const { options } = sdk.calls[0];
    expect(options.allowedTools).toEqual(["Read", "Glob", "Grep"]);
    expect(options.cwd).toBe("/work/checkout");
    expect(options.model).toBe("m");
  });

  it("reports cost and tokens, and parses the verdicts", async () => {
    const usage: unknown[] = [];
    const out = await new ClaudeProvider().reflect({ ...input, onUsage: (u) => usage.push(u) });
    expect(usage).toEqual([{ costUsd: 0.07, inputTokens: 1200, outputTokens: 80 }]);
    expect(out.verdicts[0].verdict).toBe("keep");
  });

  it("reports the cost even when the call then fails", async () => {
    sdk.subtype = "error_max_turns";
    const usage: unknown[] = [];
    await expect(
      new ClaudeProvider().reflect({ ...input, onUsage: (u) => usage.push(u) }),
    ).rejects.toThrow(/reflection failed/);
    expect(usage).toHaveLength(1);
  });
});
