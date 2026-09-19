/**
 * Records what `context.sources` in komodo.yaml resolved to, so the
 * Cross-repo context screen can show a fact the reviewer actually used
 * instead of walking the filesystem itself — which the web server may not
 * even have a checkout to do.
 *
 * File bodies never leave this module: the record carries scope and size,
 * not text, the same restraint `MemoryRuleUse.paths` applies to memory rules.
 */
import { META_CONTEXT_SOURCES, type KomodoStore, type SharedContextRecord } from "@komodo/store";
import type { ResolvedContextSource } from "@komodo/core";

export function toSharedContextRecord(
  resolved: ResolvedContextSource[],
  now: number = Date.now(),
): SharedContextRecord {
  return {
    version: 1,
    resolvedAt: now,
    sources: resolved.map((r) => ({
      type: r.source.type,
      name: r.name,
      configuredPath: r.source.path,
      root: r.root,
      repos: r.source.repos,
      clusters: r.source.clusters,
      ok: r.ok,
      error: r.error ?? null,
      files: r.files.map((f) => ({
        path: f.path,
        label: f.label,
        description: f.description ?? null,
        repos: f.scope.repos,
        clusters: f.scope.clusters,
        globs: f.scope.globs,
        chars: f.chars,
        truncated: f.truncated,
        warning: f.warning ?? null,
      })),
    })),
  };
}

/** Best effort: a store write failing must not stop a review or a boot pass. */
export async function recordContextSources(
  store: KomodoStore,
  resolved: ResolvedContextSource[],
  now: number = Date.now(),
): Promise<void> {
  try {
    await store.setMeta(META_CONTEXT_SOURCES, JSON.stringify(toSharedContextRecord(resolved, now)));
  } catch {
    // The next pass tries again; a stale or missing record just leaves the
    // screen showing what it last knew.
  }
}
