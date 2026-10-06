import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  calls: [] as Array<{ options: Record<string, unknown> }>,
  cost: 0.42 as number | undefined,
  subtype: "success" as string,
}));

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: (args: { options: Record<string, unknown> }) => {
    sdk.calls.push(args);
    return (async function* () {
      yield {
        type: "result",
        subtype: sdk.subtype,
        total_cost_usd: sdk.cost,
        structured_output: {
          summary: "- Adds a limiter",
          walkthrough: [],
          confidence: 3,
          verdict: "Read the limiter.",
          effort: 1,
          verificationChecks: [],
          judgements: [],
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
    url: "https://github.com/acme/api/pull/1", baseRef: "main", headRef: "limits",
    headSha: "abc", isDraft: false, labels: [],
  },
  files: [],
  config: KomodoConfigSchema.parse({}),
};

describe("ClaudeProvider", () => {
  beforeEach(() => {
    sdk.calls.length = 0;
    sdk.cost = 0.42;
    sdk.subtype = "success";
  });

  it("keeps the forty-turn budget a standard review always had", async () => {
    await new ClaudeProvider().review(input);
    expect(sdk.calls[0].options.maxTurns).toBe(40);
  });

  it("gives a deeper pass the budget it was handed", async () => {
    await new ClaudeProvider().review({ ...input, turnBudget: 80 });
    expect(sdk.calls[0].options.maxTurns).toBe(80);
  });

  it("reports the cost the SDK states", async () => {
    const usage: unknown[] = [];
    await new ClaudeProvider().review({ ...input, onUsage: (u) => usage.push(u) });
    expect(usage).toEqual([{ costUsd: 0.42 }]);
  });

  it("reports nothing when the SDK states nothing", async () => {
    sdk.cost = undefined;
    const usage: unknown[] = [];
    await new ClaudeProvider().review({ ...input, onUsage: (u) => usage.push(u) });
    expect(usage).toEqual([]);
  });

  it("reports the cost of a pass that then failed, because it was still spent", async () => {
    sdk.subtype = "error_max_turns";
    sdk.cost = 0.3;
    const usage: unknown[] = [];
    await expect(
      new ClaudeProvider().review({ ...input, onUsage: (u) => usage.push(u) }),
    ).rejects.toThrow("error_max_turns");
    expect(usage).toEqual([{ costUsd: 0.3 }]);
  });
});
