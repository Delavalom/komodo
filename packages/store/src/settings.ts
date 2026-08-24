/**
 * What a deployment reviews like before anyone changes anything.
 *
 * These are the values a fresh store starts from, and — because settings are
 * stored as one JSON row read merged over this object — also the fallback for
 * any field added after a row was written. That is what lets the settings
 * screen grow without a migration behind it.
 *
 * They deliberately match @komodo/core's schema defaults where the two
 * overlap, so a deployment that never opens the settings screen behaves
 * exactly as komodo.yaml alone would.
 */
import type { OrgSettings, SummarySectionConfig } from "./types.js";

const open = (): SummarySectionConfig => ({
  enabled: true,
  collapsible: true,
  defaultOpen: true,
});

const folded = (): SummarySectionConfig => ({
  enabled: true,
  collapsible: true,
  defaultOpen: false,
});

export const DEFAULT_ORG_SETTINGS: OrgSettings = {
  autoReviewNewPullRequests: true,
  autoReviewNewCommits: true,
  reviewDraftPrs: false,
  fileChangeLimit: 100,
  authorFilterMode: "exclude",
  // The bots that open pull requests nobody wants a judgement on. Reviewing
  // them is the fastest way to spend a subscription's quota on nothing.
  authorFilterTokens: [
    "dependabot[bot]",
    "renovate[bot]",
    "pre-commit-ci[bot]",
    "github-actions[bot]",
  ],
  updatePrDescription: false,
  // Mirrors @komodo/core's `modules` defaults, so a deployment that never
  // opens this screen posts exactly what komodo.yaml alone would.
  summarySections: {
    summary: { enabled: true, collapsible: false, defaultOpen: true },
    confidence: { enabled: true, collapsible: false, defaultOpen: true },
    walkthrough: open(),
    diagram: folded(),
  },
  customInstructions: "",
  strictness: "high",
  commentHeader: "",
  promptToFixWithAi: true,
  useStatusChecks: false,
  requiredConfidence: 3,
  postStatusComments: false,
  autoApprovePrs: false,
  maxAutoApproveRisk: "low",
  autoEnableNewRepos: false,
  memoryEnabled: true,
  orgDisplayName: "",
};

/**
 * Folds a stored row over the defaults.
 *
 * Shallow except for `summarySections`, which is a record of five independent
 * toggles: a stored row that predates a section must not lose the sections it
 * does carry, and a spread alone would replace the whole record.
 */
export function mergeSettings(stored: unknown): OrgSettings {
  if (!stored || typeof stored !== "object") return { ...DEFAULT_ORG_SETTINGS };
  const patch = stored as Partial<OrgSettings>;

  return {
    ...DEFAULT_ORG_SETTINGS,
    ...patch,
    summarySections: {
      ...DEFAULT_ORG_SETTINGS.summarySections,
      ...(patch.summarySections ?? {}),
    },
  };
}
