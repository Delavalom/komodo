/**
 * The seam between the settings screen and the reviewer.
 *
 * These tests exist because the failure they guard against is silent: a
 * control that writes a field nothing reads looks exactly like a control that
 * works, right up until someone raises a threshold and nothing changes.
 */
import { describe, expect, it } from "vitest";

import { KomodoConfigSchema, type KomodoConfig } from "@komodo/core";
import { DEFAULT_ORG_SETTINGS, type OrgSettings } from "@komodo/store";

import { applySettings, configToSettings } from "../src/settings.js";

const baseConfig = (over: Record<string, unknown> = {}): KomodoConfig =>
  KomodoConfigSchema.parse(over);

const settings = (over: Partial<OrgSettings> = {}): OrgSettings => ({
  ...DEFAULT_ORG_SETTINGS,
  ...over,
});

describe("applySettings", () => {
  it("turns strictness into a severity floor", () => {
    expect(applySettings(baseConfig(), settings({ strictness: "low" })).min_severity)
      .toBe("critical");
    expect(applySettings(baseConfig(), settings({ strictness: "medium" })).min_severity)
      .toBe("major");
    expect(applySettings(baseConfig(), settings({ strictness: "high" })).min_severity)
      .toBe("minor");
  });

  it("carries the re-review toggle through to the work list's query", () => {
    // Reaches listPullRequestsNeedingReview({ reReview }). Off, the first
    // verdict stands until someone retriggers it.
    const config = applySettings(baseConfig(), settings({ autoReviewNewCommits: false }));
    expect(config.auto_review.on_new_commits).toBe(false);
  });

  it("carries the draft toggle through to the config the poller reads", () => {
    // The exclusion used to be hardcoded in SQL, where this could never reach.
    const config = applySettings(baseConfig(), settings({ reviewDraftPrs: true }));
    expect(config.auto_review.drafts).toBe(true);
  });

  it("replaces the file's instructions rather than appending to them", () => {
    const config = applySettings(
      baseConfig({ instructions: "From the file." }),
      settings({ customInstructions: "From the screen." }),
    );
    expect(config.instructions).toBe("From the screen.");
  });

  it("falls back to the file's instructions when the box is blank", () => {
    const config = applySettings(
      baseConfig({ instructions: "From the file." }),
      settings({ customInstructions: "   " }),
    );
    expect(config.instructions).toBe("From the file.");
  });

  it("maps the queue's impact vocabulary onto the reviewer's severities", () => {
    const config = applySettings(
      baseConfig(),
      settings({ autoApprovePrs: true, maxAutoApproveRisk: "medium" }),
    );
    expect(config.post.auto_approve).toEqual({
      enabled: true,
      max_severity: "minor",
    });
  });

  it("leaves deployment facts to komodo.yaml", () => {
    // provider, post.mode, the roster and the public URL are not preferences,
    // and the screen has no control for any of them.
    const config = applySettings(
      baseConfig({
        provider: "codex",
        post: { mode: "full" },
        local: { url: "https://komodo.internal" },
      }),
      settings({ strictness: "low" }),
    );
    expect(config.provider).toBe("codex");
    expect(config.post.mode).toBe("full");
    expect(config.local.url).toBe("https://komodo.internal");
  });

  it("maps every summary section onto a module the renderer knows", () => {
    const config = applySettings(baseConfig(), settings());
    expect(Object.keys(config.modules).sort()).toEqual(
      ["confidence", "diagram", "summary", "walkthrough"],
    );
  });
});

describe("configToSettings", () => {
  it("round-trips the defaults, so first boot changes nothing", () => {
    // The important property: adopting a config that is entirely defaults must
    // produce settings that apply back as those same defaults. If it does not,
    // the first boot of any deployment silently alters how it reviews.
    const config = baseConfig();
    const adopted = applySettings(
      config,
      { ...DEFAULT_ORG_SETTINGS, ...configToSettings(config) },
    );

    expect(adopted.min_severity).toBe(config.min_severity);
    expect(adopted.auto_review.drafts).toBe(config.auto_review.drafts);
    expect(adopted.auto_review.max_files).toBe(config.auto_review.max_files);
    expect(adopted.post.update_description).toBe(config.post.update_description);
    expect(adopted.post.status_check).toBe(config.post.status_check);
    expect(adopted.post.status_min_confidence).toBe(config.post.status_min_confidence);
    expect(adopted.post.status_comments).toBe(config.post.status_comments);
    expect(adopted.auto_review.on_new_commits).toBe(config.auto_review.on_new_commits);
    expect(adopted.post.include_fix_prompts).toBe(config.post.include_fix_prompts);
    expect(adopted.post.auto_approve).toEqual(config.post.auto_approve);
    expect(adopted.modules).toEqual(config.modules);
  });

  it("adopts a non-default file config faithfully", () => {
    const config = baseConfig({
      min_severity: "critical",
      auto_review: { drafts: true, max_files: 25 },
      post: { status_check: true, status_min_confidence: 5, header: "Heads up." },
    });
    const adopted = applySettings(
      config,
      { ...DEFAULT_ORG_SETTINGS, ...configToSettings(config) },
    );

    expect(adopted.min_severity).toBe("critical");
    expect(adopted.auto_review.drafts).toBe(true);
    expect(adopted.auto_review.max_files).toBe(25);
    expect(adopted.post.status_min_confidence).toBe(5);
    expect(adopted.post.header).toBe("Heads up.");
  });
});
