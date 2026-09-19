import { readFileSync } from "node:fs";

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

  it("cannot be told to approve, whatever the caller passes", () => {
    // The automated path calls postReview and nothing else. Its signature
    // takes no event, and the literal sits after the caller's arguments in the
    // object it builds — so there is no shape of call that reaches an APPROVE.
    // AGENTS.md rule 15 rests on this, so it is asserted rather than assumed.
    const source = readFileSync(
      new URL("../src/github.ts", import.meta.url),
      "utf8",
    );
    const body = source
      .slice(source.indexOf("async postReview("), source.indexOf("async createReviewComment("))
      // Comments talk about events; only the code decides one.
      .replace(/\/\/[^\n]*/g, "");

    const events = body.match(/event:[^,\n]*/g) ?? [];
    expect(events).toEqual([`event: "COMMENT"`]);
    // And nothing spread in beside it, which is the other way a caller's
    // object could carry an event through.
    expect(body).not.toContain("...");
  });

  it("keeps approving on a method the automated path does not call", () => {
    // The one thing that can approve. Rule 15's promise is not that this
    // refuses — it takes the event because a person chose it — but that
    // nothing in the reviewer reaches it. If a second caller ever appears,
    // this is the test that should have to change with it.
    const callers = [
      "src/pipeline.ts",
      "src/providers/index.ts",
      "src/store.ts",
    ].map((file) =>
      readFileSync(new URL(`../${file}`, import.meta.url), "utf8"),
    );

    for (const source of callers) {
      expect(source).not.toContain("submitHumanReview");
    }
  });

  it("submits the event a person chose, and pins it to a commit", async () => {
    const github = new GitHubClient("personal-token");
    const request = vi.fn().mockResolvedValue({ html_url: "https://example.test/r" });
    Object.defineProperty(github, "request", { value: request });

    await github.submitHumanReview(
      { owner: "acme", repo: "app", number: 7 },
      { event: "APPROVE", body: "Looks right to me.", headSha: "abcdef" },
    );

    expect(request).toHaveBeenCalledWith(
      "POST",
      "/repos/acme/app/pulls/7/reviews",
      expect.objectContaining({ event: "APPROVE", commit_id: "abcdef" }),
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
