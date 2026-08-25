import { describe, expect, it, vi } from "vitest";

import { KomodoConfigSchema } from "../src/config.js";
import { GitHubClient, type PRMeta } from "../src/github.js";
import { buildReviewPrompt } from "../src/providers/prompt.js";

describe("human review boundary", () => {
  it("hard-codes full AI reviews as comments", async () => {
    const github = new GitHubClient("test-token");
    const request = vi.fn().mockResolvedValue({ html_url: "https://example.test/review" });
    Object.defineProperty(github, "request", { value: request });

    await github.postReview(
      { owner: "acme", repo: "app", number: 7 },
      "abcdef",
      "AI preflight",
      [],
    );

    expect(request).toHaveBeenCalledWith(
      "POST",
      "/repos/acme/app/pulls/7/reviews",
      expect.objectContaining({ event: "COMMENT" }),
    );
  });

  it("asks for observed results without claiming approval", () => {
    const pr: PRMeta = {
      owner: "acme",
      repo: "app",
      number: 7,
      title: "Change the settings form",
      body: "",
      author: "dev",
      url: "https://github.com/acme/app/pull/7",
      baseRef: "main",
      headRef: "settings",
      headSha: "abcdef",
      isDraft: false,
      labels: [],
    };
    const prompt = buildReviewPrompt({
      pr,
      files: [
        {
          path: "src/settings.tsx",
          status: "modified",
          additions: 1,
          deletions: 1,
          patch: "@@ -1 +1 @@\n-old\n+new",
        },
      ],
      config: KomodoConfigSchema.parse({}),
    });

    expect(prompt).toContain("results that must be observed");
    expect(prompt).toContain("verificationChecks");
    expect(prompt).toContain("never means approved");
    expect(prompt).toContain("architectural fit, inappropriate scope");
  });
});
