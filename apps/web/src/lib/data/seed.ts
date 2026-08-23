/**
 * Local-only fixtures.
 *
 * Almost nothing is left. The queue, review settings, custom context, API keys
 * and integrations all come from @komodo/store now, so they are shared rather
 * than per-browser. What remains is one person's display preferences.
 *
 * Note what is NOT here: a name and an email. Those used to be hardcoded, so
 * every deployment of Komodo showed one particular person in its header. The
 * signed-in identity comes from the roster in komodo.yaml — see
 * `usePersonalSettings`.
 */
import type { PersonalPreferences } from "@/lib/types";

/** Preferences only. Identity is folded in from the roster at read time. */
export const PERSONAL_PREFERENCES: PersonalPreferences = {
  showAiFixPrompts: false,
  reviewSections: {
    summary: { enabled: true, collapsible: false, defaultOpen: true },
    confidence: { enabled: true, collapsible: false, defaultOpen: true },
    walkthrough: { enabled: true, collapsible: true, defaultOpen: true },
    diagram: { enabled: true, collapsible: true, defaultOpen: false },
  },
};
