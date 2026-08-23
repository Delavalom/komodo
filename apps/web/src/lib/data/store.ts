"use client";

/**
 * Local-only state.
 *
 * Almost nothing is left. Everything a team shares — the queue, review
 * settings, custom context, API keys, integrations — is in @komodo/store,
 * because per-browser localStorage cannot back any of it. What remains is
 * genuinely per-browser: one person's own display preferences, and the filter
 * chips, which were never server state.
 *
 * `skipHydration` is deliberate: the server renders seed state, the first
 * client render matches it, and the persisted state is folded in afterwards
 * through the subscription in `useStoreHydrated`. No effects, no flash.
 */
import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { PERSONAL_PREFERENCES } from "@/lib/data/seed";
import type { PersonalPreferences } from "@/lib/types";

export interface JudgmentFilterState {
  search: string;
  author?: string;
  repo?: string;
  subgroup?: string;
  status?: string;
  confidence?: string;
  impact?: string;
  sort?: "asc" | "desc";
}

export interface DataState {
  personalPreferences: PersonalPreferences;
  /** Persisted so chips survive a hard navigation. */
  judgmentFilters: JudgmentFilterState;

  updatePersonalSettings: (patch: Partial<PersonalPreferences>) => void;
  setJudgmentFilters: (patch: Partial<JudgmentFilterState>) => void;
  clearJudgmentFilters: () => void;
  reset: () => void;
}

const EMPTY_FILTERS: JudgmentFilterState = { search: "" };

function seedState() {
  return {
    personalPreferences: { ...PERSONAL_PREFERENCES },
    judgmentFilters: { ...EMPTY_FILTERS },
  };
}

export const useDataStore = create<DataState>()(
  persist(
    (set) => ({
      ...seedState(),

      updatePersonalSettings: (patch) =>
        set((s) => ({
          personalPreferences: { ...s.personalPreferences, ...patch },
        })),

      setJudgmentFilters: (patch) =>
        set((s) => ({ judgmentFilters: { ...s.judgmentFilters, ...patch } })),

      clearJudgmentFilters: () =>
        set({ judgmentFilters: { ...EMPTY_FILTERS } }),

      reset: () => set(seedState()),
    }),
    { name: "komodo", version: 1, skipHydration: true },
  ),
);

/* ── Hydration, without an effect ────────────────────────────────────────── */

let rehydrateStarted = false;

function subscribeHydration(onChange: () => void) {
  if (!rehydrateStarted) {
    rehydrateStarted = true;
    void useDataStore.persist.rehydrate();
  }
  return useDataStore.persist.onFinishHydration(onChange);
}

/**
 * `false` on the server and on the first client render, `true` once the
 * persisted state has been folded in. Mounting <StoreHydration /> once in the
 * layout is what kicks the rehydration off.
 */
export function useStoreHydrated(): boolean {
  return useSyncExternalStore(
    subscribeHydration,
    () => useDataStore.persist.hasHydrated(),
    () => false,
  );
}

export function StoreHydration() {
  useStoreHydrated();
  return null;
}
