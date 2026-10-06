/**
 * The seam between the settings screen and the reviewer.
 *
 * These tests exist because the failure they guard against is silent: a
 * control that writes a field nothing reads looks exactly like a control that
 * works, right up until someone raises a threshold and nothing changes.
 */
import { describe, expect, it } from "vitest";

import {
  DEPTH_LABEL as CORE_DEPTH_LABEL,
  DEPTH_PASSES as CORE_DEPTH_PASSES,
  KomodoConfigSchema,
  REVIEW_DEPTHS,
  type KomodoConfig,
} from "@komodo/core";
import {
  DEFAULT_ORG_SETTINGS,
  DEPTH_LABEL as STORE_DEPTH_LABEL,
  DEPTH_PASSES as STORE_DEPTH_PASSES,
  REVIEW_DEPTH_ORDER,
  type OrgSettings,
} from "@komodo/store";

import { applySettings, configToSettings, depthDiffersFromFile } from "../src/settings.js";

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
    expect(adopted.post.status_comments).toBe(config.post.status_comments);
    expect(adopted.auto_review.on_new_commits).toBe(config.auto_review.on_new_commits);
    expect(adopted.auto_review.new_pull_requests).toBe(
      config.auto_review.new_pull_requests,
    );
    expect(adopted.post.include_fix_prompts).toBe(config.post.include_fix_prompts);
    expect(adopted.modules).toEqual(config.modules);
  });

  it("carries both automatic-review switches out of the file", () => {
    // A deployment that wants the old behaviour says so in komodo.yaml once,
    // and the settings row it is adopted into is what the screen then owns.
    const config = baseConfig({
      auto_review: { new_pull_requests: true, on_new_commits: true },
    });
    const settings = configToSettings(config);

    expect(settings.autoReviewNewPullRequests).toBe(true);
    expect(settings.autoReviewNewCommits).toBe(true);

    const adopted = applySettings(config, {
      ...DEFAULT_ORG_SETTINGS,
      ...settings,
    });
    expect(adopted.auto_review.new_pull_requests).toBe(true);
    expect(adopted.auto_review.on_new_commits).toBe(true);
  });

  it("adopts a non-default file config faithfully", () => {
    const config = baseConfig({
      min_severity: "critical",
      auto_review: { drafts: true, max_files: 25 },
      post: { status_check: true, header: "Heads up." },
    });
    const adopted = applySettings(
      config,
      { ...DEFAULT_ORG_SETTINGS, ...configToSettings(config) },
    );

    expect(adopted.min_severity).toBe("critical");
    expect(adopted.auto_review.drafts).toBe(true);
    expect(adopted.auto_review.max_files).toBe(25);
    expect(adopted.post.status_check).toBe(true);
    expect(adopted.post.header).toBe("Heads up.");
  });
});

describe("review depth", () => {
  it("hands the screen's default and rules to the reviewer", () => {
    const config = applySettings(
      baseConfig(),
      settings({
        reviewDepth: "deep",
        depthRules: [
          { kind: "files", value: "28", depth: "thorough" },
          { kind: "path", value: "migrations/**", depth: "thorough" },
          { kind: "label", value: "needs-deep-review", depth: "thorough" },
          { kind: "lines", value: "800", depth: "thorough" },
        ],
      }),
    );
    expect(config.depth).toEqual({
      default: "deep",
      rules: [
        { depth: "thorough", files: 28 },
        { depth: "thorough", path: "migrations/**" },
        { depth: "thorough", label: "needs-deep-review" },
        { depth: "thorough", lines: 800 },
      ],
    });
  });

  it("drops a rule no pull request could satisfy rather than handing it on", () => {
    const config = applySettings(
      baseConfig(),
      settings({
        depthRules: [
          { kind: "files", value: "0", depth: "deep" },
          { kind: "lines", value: "lots", depth: "deep" },
          { kind: "path", value: "  ", depth: "deep" },
          // A leading "!" is negation to the glob matcher, the opposite of
          // what a path_filters-style author means.
          { kind: "path", value: "!**/*.md", depth: "deep" },
        ],
      }),
    );
    expect(config.depth.rules).toEqual([]);
  });

  it("refuses a malformed setting rather than handing it on", () => {
    // updateOrgSettings is a server action with no runtime validation, so the
    // row can hold anything a client chose to send.
    const bad = (value: unknown) => value as never;
    const config = applySettings(
      baseConfig({ depth: { default: "deep" } }),
      settings({
        reviewDepth: bad("max"),
        depthRules: [
          { kind: "label", value: "risky", depth: bad("max") },
          { kind: bad("owner"), value: "marco", depth: "deep" },
          { kind: "label", value: bad(7), depth: "deep" },
        ],
      }),
    );
    expect(config.depth).toEqual({ default: "deep", rules: [] });
  });

  it("survives a row whose rules are not a list", () => {
    const config = applySettings(
      baseConfig(),
      settings({ depthRules: null as unknown as OrgSettings["depthRules"] }),
    );
    expect(config.depth.rules).toEqual([]);
  });

  it("round-trips komodo.yaml's depth through the stored row", () => {
    const file = baseConfig({
      depth: {
        default: "deep",
        rules: [
          { files: 28, depth: "thorough" },
          { lines: 800, depth: "deep" },
          { path: "migrations/**", depth: "thorough" },
          { label: "risky", depth: "thorough" },
        ],
      },
    });
    const adopted = applySettings(baseConfig(), settings(configToSettings(file)));
    expect(adopted.depth).toEqual(file.depth);
  });

  describe("depthDiffersFromFile", () => {
    const file = baseConfig({
      depth: {
        default: "deep",
        rules: [
          { files: 28, depth: "thorough" },
          { label: "risky", depth: "thorough" },
        ],
      },
    });

    it("agrees with the row it adopted, whatever order the rules are in", () => {
      const row = configToSettings(file);
      expect(depthDiffersFromFile(file, settings(row))).toBe(false);
      const reversed = settings({ ...row, depthRules: [...(row.depthRules ?? [])].reverse() });
      expect(depthDiffersFromFile(file, reversed)).toBe(false);
    });

    it("notices a changed threshold or depth even when the rule count matches", () => {
      const row = configToSettings(file);
      const [first, second] = row.depthRules ?? [];
      expect(
        depthDiffersFromFile(file, settings({ ...row, depthRules: [{ ...first, value: "40" }, second] })),
      ).toBe(true);
      expect(
        depthDiffersFromFile(file, settings({ ...row, depthRules: [first, { ...second, depth: "deep" }] })),
      ).toBe(true);
    });

    it("notices a different default", () => {
      expect(depthDiffersFromFile(file, settings({ ...configToSettings(file), reviewDepth: "standard" }))).toBe(true);
    });
  });

  it("keeps the store's depth tables in step with core's", () => {
    expect([...REVIEW_DEPTH_ORDER]).toEqual([...REVIEW_DEPTHS]);
    expect(STORE_DEPTH_PASSES).toEqual(CORE_DEPTH_PASSES);
    expect(STORE_DEPTH_LABEL).toEqual(CORE_DEPTH_LABEL);
  });
});
