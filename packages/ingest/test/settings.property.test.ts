/**
 * Round-trip property for the settings seam (AGENTS.md rule 3): a field the
 * screen writes must come back out of `applySettings` unchanged, or a control
 * silently stops meaning anything.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { KomodoConfigSchema, type KomodoConfig } from "@komodo/core";
import { DEFAULT_ORG_SETTINGS, mergeSettings, type OrgSettings } from "@komodo/store";

import { applySettings, configToSettings } from "../src/settings.js";

const RUNS = { seed: 20261017, numRuns: 300 };

const reviewDepth = fc.constantFrom("standard", "deep", "thorough");

// `files`/`lines` as positive integers; `path`/`label` as trimmed, non-"!"
// strings — exactly the shapes DepthRuleSchema accepts, built directly rather
// than filtered, per S2.4 step 3.
const depthRule = fc.oneof(
  fc.record({ depth: reviewDepth, files: fc.integer({ min: 1, max: 500 }) }),
  fc.record({ depth: reviewDepth, lines: fc.integer({ min: 1, max: 5000 }) }),
  fc.record({ depth: reviewDepth, path: fc.stringMatching(/^[a-z][a-z0-9_/*-]{0,19}$/) }),
  fc.record({ depth: reviewDepth, label: fc.stringMatching(/^[a-z][a-z0-9-]{0,19}$/) }),
);

const word = fc.constantFrom("fix", "the", "bug", "please", "check", "tests", "docs");
// No leading/trailing whitespace: `applySettings` trims what the settings
// screen's textbox returns before using it, same as any real text control.
const instructions = fc.option(fc.array(word, { maxLength: 6 }).map((ws) => ws.join(" ")), {
  nil: undefined,
});

const moduleToggle = fc.record({
  enabled: fc.boolean(),
  collapsible: fc.boolean(),
  defaultOpen: fc.boolean(),
});

const login = fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/);

/**
 * Only the `KomodoConfig` fields `configToSettings` reads and `applySettings`
 * writes back. Everything else is left to the schema's own defaults — those
 * fields pass through `applySettings` untouched (it spreads `...config` and
 * only overrides the fields below), so they add nothing to this property.
 *
 * `min_severity` excludes "trivial" on purpose: `configToSettings` /
 * `applySettings` map four severities onto the settings screen's three
 * strictness positions, and the file comment next to `STRICTNESS` in
 * src/settings.ts says plainly that "trivial" has no position of its own and
 * folds into "high" (→ "minor") — a *documented* lossy mapping, not a round
 * trip this property is testing.
 */
const partialConfig = fc.record({
  min_severity: fc.constantFrom("critical", "major", "minor"),
  instructions,
  depth: fc.record({
    default: reviewDepth,
    rules: fc.array(depthRule, { maxLength: 6 }),
  }),
  auto_review: fc.record({
    drafts: fc.boolean(),
    max_files: fc.nat({ max: 1000 }),
    new_pull_requests: fc.boolean(),
    on_new_commits: fc.boolean(),
    authors: fc.record({
      mode: fc.constantFrom("exclude", "include"),
      tokens: fc.array(login, { maxLength: 4 }),
    }),
  }),
  modules: fc.record({
    summary: moduleToggle,
    confidence: moduleToggle,
    walkthrough: moduleToggle,
    diagram: moduleToggle,
  }),
  post: fc.record({
    update_description: fc.boolean(),
    status_check: fc.boolean(),
    status_comments: fc.boolean(),
    header: fc.array(word, { maxLength: 4 }).map((ws) => ws.join(" ")),
    include_fix_prompts: fc.boolean(),
  }),
});

describe("settings round trip", () => {
  it("applySettings(config, configToSettings(config)) deep-equals config", () => {
    fc.assert(
      fc.property(partialConfig, (partial) => {
        const config: KomodoConfig = KomodoConfigSchema.parse(partial);
        // Mirrors how a real store actually holds what `configToSettings`
        // returns: `saveSettings` persists the partial, and `loadSettings`
        // folds it back over `DEFAULT_ORG_SETTINGS` via `mergeSettings` — see
        // initializeSettings/effectiveConfig in src/settings.ts.
        const settings: OrgSettings = mergeSettings(configToSettings(config));
        expect(applySettings(config, settings)).toEqual(config);
      }),
      RUNS,
    );
  });

  it("an org's display name alone never changes the effective config", () => {
    // orgDisplayName is read by configToSettings (to seed a fresh store from
    // komodo.yaml's team.name) but applySettings has no line that writes it
    // back into config.team — it is seed-only, not part of the live apply.
    fc.assert(
      fc.property(partialConfig, fc.string({ maxLength: 20 }), (partial, name) => {
        const config: KomodoConfig = KomodoConfigSchema.parse(partial);
        const settings: OrgSettings = { ...DEFAULT_ORG_SETTINGS, orgDisplayName: name };
        expect(applySettings(config, settings).team).toEqual(config.team);
      }),
      RUNS,
    );
  });
});
