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
import { REVIEW_DEPTHS } from "@komodo/core";
import type { DepthRule, KomodoConfig, ReviewDepth, Severity } from "@komodo/core";
import { META_SETTINGS_INITIALIZED } from "@komodo/store";
import type { DepthRuleSetting, KomodoStore, OrgSettings } from "@komodo/store";

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
    depth: {
      // updateOrgSettings has no runtime validation, so the row can hold
      // anything a client sent. Fall back to the file rather than hand the
      // reviewer a depth it has no passes for.
      default: isDepth(settings.reviewDepth) ? settings.reviewDepth : config.depth.default,
      rules: Array.isArray(settings.depthRules) ? settings.depthRules.flatMap(toConfigRule) : [],
    },
    // The screen's box replaces the file's text rather than appending to it:
    // two sources of repository instructions silently concatenated is a
    // prompt nobody wrote.
    instructions: settings.customInstructions.trim() || config.instructions,
    auto_review: {
      ...config.auto_review,
      drafts: settings.reviewDraftPrs,
      max_files: settings.fileChangeLimit,
      new_pull_requests: settings.autoReviewNewPullRequests,
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
      status_comments: settings.postStatusComments,
      header: settings.commentHeader,
      include_fix_prompts: settings.promptToFixWithAi,
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
    autoReviewNewPullRequests: config.auto_review.new_pull_requests,
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
    postStatusComments: config.post.status_comments,
    commentHeader: config.post.header,
    promptToFixWithAi: config.post.include_fix_prompts,
    reviewDepth: config.depth.default,
    depthRules: config.depth.rules.map(toSettingRule),
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

/**
 * Whether the store's depth settings say something komodo.yaml's do not.
 *
 * Compared as the reviewer would read them — the stored row through
 * `applySettings`, so a row the reviewer would refuse is compared as what it
 * becomes — and every field of every rule, so swapping one rule's depth or
 * threshold is a disagreement even when the count matches. Order is ignored:
 * the deepest match wins either way.
 */
export function depthDiffersFromFile(config: KomodoConfig, settings: OrgSettings): boolean {
  const stored = applySettings(config, settings).depth;
  const key = (rules: DepthRule[]) =>
    rules
      .map(toSettingRule)
      .map((r) => `${r.kind}\u0000${r.value}\u0000${r.depth}`)
      .sort()
      .join("\u0001");
  return (
    stored.default !== config.depth.default || key(stored.rules) !== key(config.depth.rules)
  );
}

/** The config the reviewer should actually run with, this pass. */
export async function effectiveConfig(
  store: KomodoStore,
  config: KomodoConfig,
): Promise<KomodoConfig> {
  return applySettings(config, await store.loadSettings());
}

const isDepth = (d: unknown): d is ReviewDepth =>
  (REVIEW_DEPTHS as readonly unknown[]).includes(d);

/**
 * A rule off the screen, in the shape komodo.yaml spells it.
 *
 * A number box holding "lots" or "0" is a rule nothing can satisfy. The
 * screen refuses to save one; this is the backstop, so a hand-edited row
 * can't hand the reviewer a condition that silently never matches.
 *
 * This object is built directly rather than parsed, so the config schema's
 * own refusals do not protect it and the same ones are repeated here.
 */
function toConfigRule(rule: DepthRuleSetting): DepthRule[] {
  if (!isDepth(rule.depth) || typeof rule.value !== "string") return [];
  const value = rule.value.trim();
  if (!value) return [];
  if (rule.kind === "files" || rule.kind === "lines") {
    if (!/^\d+$/.test(value) || Number(value) < 1) return [];
    const n = Number(value);
    return [rule.kind === "files" ? { depth: rule.depth, files: n } : { depth: rule.depth, lines: n }];
  }
  // A leading "!" is negation to the glob matcher: the opposite of a
  // path_filters entry, which is what someone typing one expects.
  if (rule.kind === "path" && value.startsWith("!")) return [];
  if (rule.kind === "path") return [{ depth: rule.depth, path: value }];
  if (rule.kind === "label") return [{ depth: rule.depth, label: value }];
  return [];
}

function toSettingRule(rule: DepthRule): DepthRuleSetting {
  if (rule.files !== undefined) return { kind: "files", value: String(rule.files), depth: rule.depth };
  if (rule.lines !== undefined) return { kind: "lines", value: String(rule.lines), depth: rule.depth };
  if (rule.path !== undefined) return { kind: "path", value: rule.path, depth: rule.depth };
  return { kind: "label", value: rule.label ?? "", depth: rule.depth };
}
