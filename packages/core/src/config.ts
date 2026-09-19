import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { SEVERITIES } from "./schema.js";

export const DEFAULT_PATH_FILTERS = [
  "!**/node_modules/**",
  "!**/dist/**",
  "!**/build/**",
  "!**/.next/**",
  "!**/*.lock",
  "!**/package-lock.json",
  "!**/pnpm-lock.yaml",
  "!**/yarn.lock",
  "!**/bun.lock*",
  "!**/*.min.js",
  "!**/*.min.css",
  "!**/*.map",
  "!**/*.snap",
  "!**/*.svg",
  "!**/*.png",
  "!**/*.jpg",
  "!**/*.jpeg",
  "!**/*.gif",
  "!**/*.woff*",
  "!**/*.pdf",
  "!**/generated/**",
  "!**/__generated__/**",
];

const ModuleToggleSchema = z.object({
  enabled: z.boolean().default(true),
  collapsible: z.boolean().default(true),
  defaultOpen: z.boolean().default(false),
});

/**
 * Narrows a shared context source or an individual file within it.
 *
 * Both `repos` and `clusters` are optional narrowings, not a required choice
 * between them: a file can be scoped by repository, by cluster, by both, or by
 * neither (applies everywhere). Matching is picomatch against `owner/name` for
 * `repos` and case-insensitive name equality for `clusters`.
 */
const ContextScopeFields = {
  repos: z.array(z.string().min(1)).default([]),
  clusters: z.array(z.string().min(1)).default([]),
};

/**
 * A folder on disk — typically a checkout of an org-wide review-rules
 * repository — whose markdown files are handed to every reviewer.
 *
 * `type` is explicit rather than inferred from which key is present so a
 * future `github` variant (fetched by the server rather than read off a local
 * checkout) can be added as a sibling without touching this one.
 */
export const PathContextSourceSchema = z.object({
  type: z.literal("path"),
  /** Defaults to the folder's basename when omitted. */
  name: z.string().min(1).optional(),
  /** Relative to the komodo.yaml that declared it; `~` is expanded. */
  path: z.string().min(1),
  /** Globs, relative to this source's root, to skip. */
  ignore: z.array(z.string()).default([]),
  ...ContextScopeFields,
});

export const ContextSourceSchema = z.discriminatedUnion("type", [PathContextSourceSchema]);
export type ContextSource = z.infer<typeof ContextSourceSchema>;

export const KomodoConfigSchema = z.object({
  provider: z.enum(["auto", "claude", "codex", "openrouter"]).default("auto"),
  model: z.string().optional(),
  /**
   * How Komodo reaches Claude Code on a managed machine.
   *
   * Some companies expose Claude through an approved proxy launcher rather
   * than the `claude` found on PATH. The Agent SDK must spawn that exact
   * executable or it bypasses the managed environment and is terminated.
   */
  claude: z
    .object({
      /** Absolute path to the enterprise-approved Claude Code executable. */
      executable: z.string().min(1).optional(),
    })
    .prefault({}),
  profile: z.enum(["chill", "assertive"]).default("chill"),
  min_severity: z.enum(SEVERITIES).default("minor"),
  path_filters: z.array(z.string()).default([]),
  path_instructions: z
    .array(z.object({ path: z.string(), instructions: z.string() }))
    .default([]),
  instructions: z.string().optional(),
  /**
   * The house voice is not configured here — it lives in `VOICE_STYLE.md` and
   * applies to every deployment, the same way it applies to every reviewer on
   * the team it was modelled on. `extra` is the one thing a team adds: its
   * own vocabulary, appended after the house voice rather than replacing it.
   * See `voiceSection` in `voice.ts`.
   */
  voice: z
    .object({
      extra: z.string().optional(),
    })
    .prefault({}),
  /**
   * Company-wide review guidance that lives outside any one repository —
   * how to review, how to gather context, how the AI should use specific
   * tools. Read fresh on every review rather than once at boot, because the
   * usual case is a checkout someone `git pull`s.
   *
   * Not a memory rule: `settings.memoryEnabled` does not gate this. Memory
   * rules are a per-repository, database-backed screen; this is a deployment
   * fact declared in the same file as `voice.extra` and `path_instructions`,
   * and it has no settings-screen control for the same reason `voice.extra`
   * doesn't — see docs/architecture/voice-style.md.
   */
  context: z
    .object({
      sources: z.array(ContextSourceSchema).default([]),
      /** Cap across every shared document handed to one review. */
      max_total_chars: z.number().int().min(1000).default(32_000),
    })
    .prefault({}),
  /**
   * Which pull requests are worth a review at all.
   *
   * Every field here is a way of not spending a subscription's quota: a draft
   * nobody is asking about, a WIP title, a bot's dependency bump, a
   * thousand-file vendor drop. The poller enforces them before it enqueues —
   * see `automaticEligibility` in packages/ingest/src/eligibility.ts — so a
   * pull request they pass over is imported into the queue and simply never
   * becomes a job. Someone who wants it anyway presses Review with AI, which
   * overrides all of this except `max_files`.
   */
  auto_review: z
    .object({
      drafts: z.boolean().default(false),
      ignore_title_keywords: z.array(z.string()).default(["WIP", "DO NOT REVIEW"]),
      labels: z.array(z.string()).default([]),
      /**
       * Author filter. `exclude` skips the listed logins — bots, usually.
       * `include` inverts it: only the listed logins are reviewed, which is
       * how a team tries Komodo on one person's pull requests first.
       */
      authors: z
        .object({
          mode: z.enum(["exclude", "include"]).default("exclude"),
          tokens: z.array(z.string()).default([]),
        })
        .prefault({}),
      /** Skip pull requests touching more files than this. 0 disables the cap. */
      max_files: z.number().int().min(0).default(0),
      /**
       * Review a pull request the poller has never seen before.
       *
       * Off by default, and that default is the expensive one to get wrong: a
       * first pass over a busy repository observes every open pull request as
       * new, and on would mean a model run for each. Off, the pass imports the
       * inventory and a person asks for the reviews they want.
       */
      new_pull_requests: z.boolean().default(false),
      /**
       * Re-review when a pull request's head moves.
       *
       * On, a push re-enters the work list and gets a fresh judgment against
       * the new head. Off, the first verdict stands until someone retriggers
       * it by hand — which is what a team that reviews once and then talks
       * about it actually wants, and what keeps a force-push sweep from
       * re-reviewing a whole queue.
       */
      on_new_commits: z.boolean().default(false),
    })
    .prefault({}),
  modules: z
    .object({
      summary: ModuleToggleSchema.default({ enabled: true, collapsible: false, defaultOpen: true }),
      walkthrough: ModuleToggleSchema.default({ enabled: true, collapsible: true, defaultOpen: true }),
      diagram: ModuleToggleSchema.default({ enabled: true, collapsible: true, defaultOpen: false }),
      confidence: ModuleToggleSchema.default({ enabled: true, collapsible: false, defaultOpen: true }),
    })
    .prefault({}),
  post: z
    .object({
      /**
       * What GitHub gets.
       *
       * `receipt` — one comment: the verdict and a link back to the review in
       * Komodo. The judgements, the questions and the answers stay here, where
       * they can be answered. This is the default because it is the product's
       * position: a review is a set of decisions, and GitHub has nowhere to
       * put one.
       *
       * `full` — the walkthrough plus an inline comment per judgement. What a
       * team still living on GitHub expects, and what Komodo did before the
       * review had a home of its own.
       *
       * `none` — nothing is posted at all.
       */
      mode: z.enum(["receipt", "full", "none"]).default("receipt"),
      update_description: z.boolean().default(false),
      status_check: z.boolean().default(false),
      /** Prepended to whatever Komodo posts. Empty means nothing is added. */
      header: z.string().default(""),
      /**
       * Say so on the pull request when a review did not happen.
       *
       * A skip is a decision, and a decision nobody can see looks like a
       * failure. With this on, a pull request that was filtered out or whose
       * review errored gets the same single Komodo comment, saying which and
       * why. Off, Komodo stays silent about the reviews it did not run.
       */
      status_comments: z.boolean().default(false),
      /**
       * Include the copy-paste "fix prompt" under each inline comment.
       *
       * Useful to a team whose next step is a coding agent, noise to one whose
       * next step is a person.
       */
      include_fix_prompts: z.boolean().default(true),
    })
    .prefault({}),
  /**
   * Who the queue is for.
   *
   * A Komodo-local roster rather than a GitHub team, so it needs no org admin
   * rights and can span organisations — which matters when the person running
   * this does not own the org's settings.
   */
  team: z
    .object({
      name: z.string().default("Team"),
      /** URL slug for the deployment. Defaults to the team name, slugified. */
      slug: z.string().optional(),
      /** GitHub logins. The join key between the roster and PR authors. */
      members: z.array(z.string()).default([]),
      /** owner/name, the repositories the poller watches. */
      repos: z.array(z.string()).default([]),
      /** Which login the UI treats as the signed-in user. */
      you: z.string().optional(),
    })
    .prefault({}),
  local: z
    .object({
      base_branch: z.string().default("auto"),
      auto_ui: z.boolean().default(true),
      /**
       * Where this deployment's review queue is reachable. The receipt links
       * back here, so on a team deployment it has to be the public URL.
       */
      url: z.string().default("http://localhost:4400"),
    })
    .prefault({}),
});

export type KomodoConfig = z.infer<typeof KomodoConfigSchema>;

export const CONFIG_FILENAMES = ["komodo.yaml", "komodo.yml", ".komodo.yaml"];

/**
 * The `turbopackIgnore` comments below are for the web app, which imports this
 * module. Turbopack sees a filesystem read under a directory it cannot resolve
 * statically and traces the entire workspace into the server bundle. The
 * directory is genuinely dynamic — it is wherever the user's repo is — so the
 * comments tell the tracer to leave these calls alone. esbuild keeps them when
 * it bundles to dist, which is what Next actually reads.
 */
export function loadConfig(dir: string = process.cwd()): { config: KomodoConfig; path?: string } {
  for (const name of CONFIG_FILENAMES) {
    const p = join(/*turbopackIgnore: true*/ dir, name);
    if (existsSync(/*turbopackIgnore: true*/ p)) {
      const raw = parse(readFileSync(/*turbopackIgnore: true*/ p, "utf8")) ?? {};
      warnDeprecatedApprovalConfig(raw, p);
      return { config: KomodoConfigSchema.parse(raw), path: p };
    }
  }
  return { config: KomodoConfigSchema.parse({}) };
}

/** The config file is an external boundary, so stale merge-authority fields speak up here. */
function warnDeprecatedApprovalConfig(raw: unknown, path: string): void {
  if (!raw || typeof raw !== "object") return;
  const post = (raw as Record<string, unknown>).post;
  if (!post || typeof post !== "object") return;
  const fields = post as Record<string, unknown>;
  const stale = ["auto_approve", "request_changes", "status_min_confidence"].filter(
    (key) => key in fields,
  );
  if (!stale.length) return;
  console.warn(
    `Komodo ignores ${stale.map((key) => `post.${key}`).join(", ")} in ${path}. ` +
      "AI prepares a review but cannot approve or request changes for a human.",
  );
}

export function effectivePathFilters(config: KomodoConfig): string[] {
  return [...DEFAULT_PATH_FILTERS, ...config.path_filters];
}
