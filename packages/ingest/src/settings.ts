/**
 * Where the settings screen meets the reviewer.
 *
 * komodo.yaml describes how a deployment reviews, and so does the
 * `/settings/review` screen. Until now only the file was read: the screen
 * wrote to a browser's localStorage and the reviewer never saw a word of it.
 *
 * This is the seam that fixes that, and it lives here for the same reason
 * map.ts does — @komodo/core has no dependency on @komodo/store and must not
 * grow one, so the one place the two vocabularies meet is the package that
 * already depends on both. If either side's unions change, this file stops
 * compiling, which is the intended alarm.
 *
 * Direction of authority:
 *
 *   - Fields the screen exposes: the stored row wins, always. It is seeded
 *     from komodo.yaml on first boot (`initializeSettings`) and owned by the
 *     team after that, so a threshold can be changed without shell access to
 *     the server.
 *   - Everything else — provider, model, profile, path filters, post.mode,
 *     the roster, local.url — comes from komodo.yaml on every pass. Those are
 *     deployment facts, not preferences.
 */
import type { KomodoConfig, Severity } from "@komodo/core";
import { META_SETTINGS_INITIALIZED } from "@komodo/store";
import type { ImpactLevel, KomodoStore, OrgSettings } from "@komodo/store";

/**
 * Strictness as a floor on severity.
 *
 * Reads backwards at a glance and is right: stricter means Komodo says more,
 * so it reaches further down the severity scale.
 */
const MIN_SEVERITY: Record<OrgSettings["strictness"], Severity> = {
  low: "critical",
  medium: "major",
  high: "minor",
};

const STRICTNESS: Record<Severity, OrgSettings["strictness"]> = {
  critical: "low",
  major: "medium",
  minor: "high",
  // The screen offers three positions and the config four. `trivial` has no
  // position of its own, and "report everything" is the nearest one.
  trivial: "high",
};

/** The queue talks in impact, the reviewer in severity. One row each way. */
const SEVERITY_FOR_IMPACT: Record<ImpactLevel, Severity> = {
  low: "trivial",
  medium: "minor",
  high: "major",
  critical: "critical",
};

const IMPACT_FOR_SEVERITY: Record<Severity, ImpactLevel> = {
  trivial: "low",
  minor: "medium",
  major: "high",
  critical: "critical",
};

/**
 * Overlays the stored settings onto the file config.
 *
 * Every field written here has a control on the settings screen; every field
 * left alone does not. That correspondence is the contract — a field that
 * appears here without a control becomes unreachable, and a control without a
 * line here is the bug this whole file exists to stop.
 */
export function applySettings(
  config: KomodoConfig,
  settings: OrgSettings,
): KomodoConfig {
  const sections = settings.summarySections;

  return {
    ...config,
    min_severity: MIN_SEVERITY[settings.strictness],
    // The screen's box replaces the file's text rather than appending to it:
    // two sources of repository instructions silently concatenated is a
    // prompt nobody wrote.
    instructions: settings.customInstructions.trim() || config.instructions,
    auto_review: {
      ...config.auto_review,
      drafts: settings.reviewDraftPrs,
      max_files: settings.fileChangeLimit,
      on_new_commits: settings.autoReviewNewCommits,
      authors: {
        mode: settings.authorFilterMode,
        tokens: settings.authorFilterTokens,
      },
    },
    modules: {
      summary: sections.summary,
      confidence: sections.confidence,
      walkthrough: sections.walkthrough,
      diagram: sections.diagram,
    },
    post: {
      ...config.post,
      update_description: settings.updatePrDescription,
      status_check: settings.useStatusChecks,
      status_min_confidence: settings.requiredConfidence,
      status_comments: settings.postStatusComments,
      header: settings.commentHeader,
      include_fix_prompts: settings.promptToFixWithAi,
      auto_approve: {
        enabled: settings.autoApprovePrs,
        max_severity: SEVERITY_FOR_IMPACT[settings.maxAutoApproveRisk],
      },
    },
  };
}

/**
 * The same mapping backwards, for seeding the row from komodo.yaml.
 *
 * Only the fields the file has an opinion about. Everything else — the org's
 * display name, whether new repositories review themselves — has no home in
 * the config and keeps its default.
 */
export function configToSettings(config: KomodoConfig): Partial<OrgSettings> {
  return {
    strictness: STRICTNESS[config.min_severity],
    customInstructions: config.instructions ?? "",
    reviewDraftPrs: config.auto_review.drafts,
    fileChangeLimit: config.auto_review.max_files,
    autoReviewNewCommits: config.auto_review.on_new_commits,
    authorFilterMode: config.auto_review.authors.mode,
    authorFilterTokens: config.auto_review.authors.tokens,
    summarySections: {
      summary: config.modules.summary,
      confidence: config.modules.confidence,
      walkthrough: config.modules.walkthrough,
      diagram: config.modules.diagram,
    },
    updatePrDescription: config.post.update_description,
    useStatusChecks: config.post.status_check,
    requiredConfidence: config.post.status_min_confidence,
    postStatusComments: config.post.status_comments,
    commentHeader: config.post.header,
    promptToFixWithAi: config.post.include_fix_prompts,
    autoApprovePrs: config.post.auto_approve.enabled,
    maxAutoApproveRisk: IMPACT_FOR_SEVERITY[config.post.auto_approve.max_severity],
    orgDisplayName: config.team.name,
  };
}

/**
 * Adopts komodo.yaml's review settings, once.
 *
 * Only on the first boot of a store: after that the screen owns these fields,
 * and re-reading the file every start would silently undo whatever the team
 * changed. The marker is a meta key rather than "is the row absent", because
 * a team that saved the defaults has a row that looks exactly like no row.
 */
export async function initializeSettings(
  store: KomodoStore,
  config: KomodoConfig,
): Promise<boolean> {
  if (await store.getMeta(META_SETTINGS_INITIALIZED)) return false;
  await store.saveSettings(configToSettings(config));
  await store.setMeta(META_SETTINGS_INITIALIZED, "1");
  return true;
}

/** The config the reviewer should actually run with, this pass. */
export async function effectiveConfig(
  store: KomodoStore,
  config: KomodoConfig,
): Promise<KomodoConfig> {
  return applySettings(config, await store.loadSettings());
}
