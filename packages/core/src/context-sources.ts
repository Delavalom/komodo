/**
 * Company-wide review guidance that lives outside any one repository.
 *
 * `komodo.yaml`'s `context.sources` points at folders on disk — typically a
 * checkout of an org-wide rules repository — and this module reads every
 * markdown file in them, honours optional frontmatter scoping, and narrows
 * the result to what applies to one pull request.
 *
 * Two independent steps, mirroring packages/ingest/src/memory.ts:
 *
 *   - `resolveContextSources` walks the filesystem once per review and never
 *     throws: a broken source (missing directory, unreadable file) degrades
 *     to `ok: false` rather than failing the review.
 *   - `selectSharedContext` is pure — no I/O — and narrows the resolved files
 *     to the ones whose scope matches a repository, its clusters, and the
 *     paths a pull request actually touches.
 *
 * This lives in @komodo/core, not @komodo/ingest, because it must reach three
 * callers: the server-side reviewer (which has a store and cluster names),
 * `komodo pr` (which has neither), and `komodo prompt` (same). Core cannot
 * depend on @komodo/store, so cluster membership is passed in as plain
 * strings by whichever caller can resolve it.
 */
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { ContextSource, KomodoConfig } from "./config.js";
import { filterPaths } from "./diff.js";

/**
 * Cap on one file's contribution to a review.
 *
 * Same figure as MAX_FILE_CHARS in packages/ingest/src/memory.ts — a very
 * large convention document is exactly the kind of file most worth reading in
 * full by a person, and least useful pasted whole into a prompt.
 */
export const MAX_CONTEXT_FILE_CHARS = 8_000;

/** How many directories deep a source is walked. */
export const MAX_CONTEXT_DEPTH = 4;

/** Stop walking a single source past this many matched files. */
export const MAX_CONTEXT_FILES = 200;

export interface ContextFileScope {
  repos: string[];
  clusters: string[];
  globs: string[];
}

export interface ContextFile {
  /** Path relative to the source root, posix separators. */
  path: string;
  /** `<source name>/<path>` — what the prompt and the UI call it. */
  label: string;
  description?: string;
  scope: ContextFileScope;
  /** Body without frontmatter, trimmed, truncated at MAX_CONTEXT_FILE_CHARS. */
  text: string;
  /** Length of `text` after truncation. */
  chars: number;
  truncated: boolean;
  /** Set when the frontmatter could not be parsed; the whole file is used as text. */
  warning?: string;
}

export interface ResolvedContextSource {
  source: ContextSource;
  /** source.name, or the source root's basename when omitted. */
  name: string;
  /** Absolute, resolved path on disk. */
  root: string;
  ok: boolean;
  /** Set when `ok` is false: missing directory, not a directory, unreadable. */
  error?: string;
  files: ContextFile[];
}

/** Expands a leading `~` to the current user's home directory. Leaves every other path untouched. */
export function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) return join(homedir(), p.slice(2));
  return p;
}

const FrontmatterSchema = z
  .object({
    description: z.string().optional(),
    repos: z.array(z.string()).default([]),
    clusters: z.array(z.string()).default([]),
    globs: z.array(z.string()).default([]),
  })
  .passthrough();

/**
 * Splits a leading `---\n ... \n---` YAML block off a markdown file.
 *
 * Never throws. A file that opens with `---` used as a horizontal rule rather
 * than frontmatter (no matching second fence, or the block does not parse to
 * an object) is returned whole, as `body`, with no `data` and no `error` — an
 * ambiguous leading rule is not a formatting mistake worth warning about.
 */
export function parseFrontmatter(raw: string): {
  data: Record<string, unknown> | null;
  body: string;
  error?: string;
} {
  if (!raw.startsWith("---")) return { data: null, body: raw };

  const afterFence = raw.slice(3);
  const newlineIdx = afterFence.indexOf("\n");
  // "---" must be followed by a newline (or be the whole file) to count as a
  // fence at all, not merely as text that happens to start with three dashes.
  if (newlineIdx === -1 && afterFence.trim() !== "") return { data: null, body: raw };

  const rest = newlineIdx === -1 ? "" : afterFence.slice(newlineIdx + 1);
  const closeIdx = rest.search(/\n---[ \t]*(\n|$)/);
  if (closeIdx === -1) return { data: null, body: raw };

  const yamlBlock = rest.slice(0, closeIdx);
  const body = rest.slice(closeIdx).replace(/^\n---[ \t]*\n?/, "");

  let parsed: unknown;
  try {
    parsed = parseYaml(yamlBlock);
  } catch (err) {
    return { data: null, body: raw, error: `frontmatter did not parse: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (parsed === null || parsed === undefined) return { data: null, body };
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    return { data: null, body: raw, error: "frontmatter must be a YAML mapping" };
  }
  const result = FrontmatterSchema.safeParse(parsed);
  if (!result.success) {
    return { data: null, body: raw, error: `frontmatter did not match the expected shape: ${result.error.issues[0]?.message ?? "invalid"}` };
  }
  return { data: result.data, body };
}

function truncate(text: string): { text: string; truncated: boolean } {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_CONTEXT_FILE_CHARS) return { text: trimmed, truncated: false };
  return { text: `${trimmed.slice(0, MAX_CONTEXT_FILE_CHARS)}\n…(truncated)`, truncated: true };
}

/** Recursively lists every `*.md` file under `root`, refusing to leave it via a symlink. */
function walkMarkdown(root: string, dir: string, depth: number, out: string[]): void {
  if (out.length >= MAX_CONTEXT_FILES || depth > MAX_CONTEXT_DEPTH) return;
  let entries: string[];
  try {
    entries = readdirSync(/*turbopackIgnore: true*/ dir).sort();
  } catch {
    return;
  }
  for (const entry of entries) {
    if (out.length >= MAX_CONTEXT_FILES) return;
    if (entry.startsWith(".") || entry === "node_modules") continue;
    const full = join(dir, entry);
    let stat: ReturnType<typeof lstatSync>;
    try {
      stat = lstatSync(/*turbopackIgnore: true*/ full);
    } catch {
      continue;
    }
    if (stat.isSymbolicLink()) {
      // Resolve and require the target stay inside the source root. A
      // symlinked directory is skipped outright rather than followed, which
      // is the simplest rule that cannot loop.
      let real: string;
      try {
        real = realpathSync(/*turbopackIgnore: true*/ full);
      } catch {
        continue;
      }
      const rel = relative(root, real);
      if (rel.startsWith("..") || rel.startsWith(sep)) continue;
      let realStat: ReturnType<typeof lstatSync>;
      try {
        realStat = lstatSync(/*turbopackIgnore: true*/ real);
      } catch {
        continue;
      }
      if (realStat.isDirectory()) continue;
      if (realStat.isFile() && entry.toLowerCase().endsWith(".md")) out.push(full);
      continue;
    }
    if (stat.isDirectory()) {
      walkMarkdown(root, full, depth + 1, out);
    } else if (stat.isFile() && entry.toLowerCase().endsWith(".md")) {
      out.push(full);
    }
  }
}

function resolveOneSource(source: ContextSource, configDir: string): ResolvedContextSource {
  const configuredRoot = resolve(configDir, expandHome(source.path));
  const fallbackName = source.name ?? basename(configuredRoot);

  if (!existsSync(/*turbopackIgnore: true*/ configuredRoot)) {
    return { source, name: fallbackName, root: configuredRoot, ok: false, error: "directory not found", files: [] };
  }

  let root: string;
  try {
    root = realpathSync(/*turbopackIgnore: true*/ configuredRoot);
  } catch (err) {
    return {
      source,
      name: fallbackName,
      root: configuredRoot,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      files: [],
    };
  }

  let rootStat: ReturnType<typeof lstatSync>;
  try {
    rootStat = lstatSync(/*turbopackIgnore: true*/ root);
  } catch (err) {
    return { source, name: fallbackName, root, ok: false, error: err instanceof Error ? err.message : String(err), files: [] };
  }
  if (!rootStat.isDirectory()) {
    return { source, name: fallbackName, root, ok: false, error: "not a directory", files: [] };
  }

  const name = source.name ?? basename(root);
  const paths: string[] = [];
  walkMarkdown(root, root, 0, paths);

  const relPaths = paths.map((p) => relative(root, p).split(sep).join("/"));
  const kept = new Set(
    source.ignore.length ? filterPaths(relPaths, source.ignore.map((g) => `!${g}`)) : relPaths,
  );

  const files: ContextFile[] = [];
  for (let i = 0; i < paths.length; i++) {
    const relPath = relPaths[i];
    if (!kept.has(relPath)) continue;
    let raw: string;
    try {
      raw = readFileSync(/*turbopackIgnore: true*/ paths[i], "utf8");
    } catch {
      continue;
    }
    const { data, body, error } = parseFrontmatter(raw);
    const { text, truncated } = truncate(body);
    if (!text) continue;
    files.push({
      path: relPath,
      label: `${name}/${relPath}`,
      description: typeof data?.description === "string" ? data.description : undefined,
      scope: {
        repos: Array.isArray(data?.repos) ? (data.repos as string[]) : [],
        clusters: Array.isArray(data?.clusters) ? (data.clusters as string[]) : [],
        globs: Array.isArray(data?.globs) ? (data.globs as string[]) : [],
      },
      text,
      chars: text.length,
      truncated,
      warning: error,
    });
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  return { source, name, root, ok: true, files };
}

/**
 * Reads every configured shared context source. Never throws: a source that
 * cannot be read is reported as `ok: false` rather than failing the review it
 * would otherwise have improved.
 */
export function resolveContextSources(config: KomodoConfig, configDir: string): ResolvedContextSource[] {
  return config.context.sources.map((source) => resolveOneSource(source, configDir));
}

export interface SharedContextDoc {
  label: string;
  text: string;
  description?: string;
}

export interface ContextSelection {
  /** `owner/name` of the repository under review. Undefined when unknown (e.g. a local branch with no remote). */
  repoId?: string;
  /** Names of the clusters the repository belongs to. Undefined when the caller has no store to ask (CLI paths). */
  clusterNames?: string[];
  /** Paths the pull request touches, after path filtering. */
  changedPaths: string[];
  maxTotalChars?: number;
}

export interface SharedContextSelection {
  docs: SharedContextDoc[];
  /** Matched scope, but dropped for exceeding maxTotalChars. */
  overflow: ContextFile[];
  /** Skipped only because they are cluster-scoped and clusterNames was undefined. */
  needsClusters: ContextFile[];
}

function matchesRepos(repoId: string | undefined, repos: string[]): boolean {
  if (!repos.length) return true;
  if (!repoId) return false;
  return filterPaths([repoId], repos).length > 0;
}

function matchesClusters(clusterNames: string[] | undefined, clusters: string[]): "yes" | "no" | "needs-clusters" {
  if (!clusters.length) return "yes";
  if (clusterNames === undefined) return "needs-clusters";
  const wanted = new Set(clusters.map((c) => c.trim().toLowerCase()));
  return clusterNames.some((c) => wanted.has(c.trim().toLowerCase())) ? "yes" : "no";
}

function matchesGlobs(changedPaths: string[], globs: string[]): boolean {
  if (!globs.length) return true;
  if (!changedPaths.length) return false;
  return filterPaths(changedPaths, globs).length > 0;
}

/**
 * Narrows resolved sources to the files whose scope matches this pull
 * request. Pure — no I/O — so `komodo prompt` can call it directly without a
 * store, the same as `runReview` does with one.
 *
 * A file must pass both its source's scope and its own frontmatter scope
 * (the two are ANDed together, not merged): a source-level `repos:` narrows
 * every file inside it before any file's own scope is even considered.
 */
export function selectSharedContext(
  sources: ResolvedContextSource[],
  sel: ContextSelection,
): SharedContextSelection {
  const docs: SharedContextDoc[] = [];
  const overflow: ContextFile[] = [];
  const needsClusters: ContextFile[] = [];
  const cap = sel.maxTotalChars ?? Infinity;
  let used = 0;

  for (const resolved of sources) {
    if (!resolved.ok) continue;
    const sourceRepoMatch = matchesRepos(sel.repoId, resolved.source.repos);
    const sourceClusterMatch = matchesClusters(sel.clusterNames, resolved.source.clusters);
    if (!sourceRepoMatch || sourceClusterMatch === "no") continue;
    if (sourceClusterMatch === "needs-clusters") {
      needsClusters.push(...resolved.files);
      continue;
    }

    for (const file of resolved.files) {
      if (!matchesRepos(sel.repoId, file.scope.repos)) continue;
      const fileClusterMatch = matchesClusters(sel.clusterNames, file.scope.clusters);
      if (fileClusterMatch === "no") continue;
      if (fileClusterMatch === "needs-clusters") {
        needsClusters.push(file);
        continue;
      }
      if (!matchesGlobs(sel.changedPaths, file.scope.globs)) continue;

      if (used + file.chars > cap) {
        overflow.push(file);
        continue;
      }
      used += file.chars;
      docs.push({ label: file.label, text: file.text, description: file.description });
    }
  }

  return { docs, overflow, needsClusters };
}
