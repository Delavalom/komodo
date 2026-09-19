import "server-only";

/**
 * What `context.sources` in komodo.yaml resolves to, for the Cross-repo
 * context screen.
 *
 * The web server never walks the filesystem itself — see
 * docs/architecture/shared-context-sources.md's "Alternatives rejected": in a
 * cloud deployment it may not even be the process reviewing anything, and on
 * one laptop two independent readers of the same folder is exactly the kind
 * of second truth AGENTS.md rule 4 warns about. So this reads the *configured*
 * sources straight from the file — for "what would this deployment need to
 * see" — and the *last resolved* record the reviewer wrote after actually
 * reading them, from the store's meta table.
 */
import { loadConfig, type ContextSource } from "@komodo/core";
import { META_CONTEXT_SOURCES, type SharedContextRecord } from "@komodo/store";

import { getStore } from "@/lib/data/server";

export interface SharedContextStatus {
  configured: ContextSource[];
  record: SharedContextRecord | null;
}

export async function loadSharedContext(): Promise<SharedContextStatus> {
  const { config } = loadConfig(process.env.KOMODO_CONFIG_DIR || process.cwd());
  const store = await getStore();
  const raw = await store.getMeta(META_CONTEXT_SOURCES);

  let record: SharedContextRecord | null = null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as SharedContextRecord;
      if (parsed && parsed.version === 1) record = parsed;
    } catch {
      // A record from a future version of Komodo, or corrupted. Treated as
      // absent — the configured list still renders, just without a result.
    }
  }

  return { configured: config.context.sources, record };
}
