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
   * Which pull requests are worth a review at all.
   *
   * Every field here is a way of not spending a subscription's quota: a draft
   * nobody is asking about, a WIP title, a bot's dependency bump, a
   * thousand-file vendor drop. The poller enforces them — see
   * `shouldReview` in packages/ingest/src/review.ts — and records a skipped
   * judgment rather than dropping the pull request silently, so the queue can
   * say why it passed.
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
       * Re-review when a pull request's head moves.
       *
       * On, a push re-enters the work list and gets a fresh judgment against
       * the new head. Off, the first verdict stands until someone retriggers
       * it by hand — which is what a team that reviews once and then talks
       * about it actually wants.
       */
      on_new_commits: z.boolean().default(true),
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
