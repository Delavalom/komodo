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
  profile: z.enum(["chill", "assertive"]).default("chill"),
  min_severity: z.enum(SEVERITIES).default("minor"),
  path_filters: z.array(z.string()).default([]),
  path_instructions: z
    .array(z.object({ path: z.string(), instructions: z.string() }))
    .default([]),
  instructions: z.string().optional(),
  auto_review: z
    .object({
      drafts: z.boolean().default(false),
      ignore_title_keywords: z.array(z.string()).default(["WIP", "DO NOT REVIEW"]),
      labels: z.array(z.string()).default([]),
    })
    .default({ drafts: false, ignore_title_keywords: ["WIP", "DO NOT REVIEW"], labels: [] }),
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
      update_description: z.boolean().default(false),
      request_changes: z.boolean().default(true),
      status_check: z.boolean().default(false),
    })
    .prefault({}),
});

export type KomodoConfig = z.infer<typeof KomodoConfigSchema>;

export const CONFIG_FILENAMES = ["komodo.yaml", "komodo.yml", ".komodo.yaml"];

export function loadConfig(dir: string = process.cwd()): { config: KomodoConfig; path?: string } {
  for (const name of CONFIG_FILENAMES) {
    const p = join(dir, name);
    if (existsSync(p)) {
      const raw = parse(readFileSync(p, "utf8")) ?? {};
      return { config: KomodoConfigSchema.parse(raw), path: p };
    }
  }
  return { config: KomodoConfigSchema.parse({}) };
}

export function effectivePathFilters(config: KomodoConfig): string[] {
  return [...DEFAULT_PATH_FILTERS, ...config.path_filters];
}
