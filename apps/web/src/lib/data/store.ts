"use client";

/**
 * Local write layer. docs/SPEC.md §12.
 *
 * Components never touch this directly — they call the hooks in
 * lib/data/mutations.ts, each of which is named after the Convex mutation it
 * becomes. Swapping in Convex means replacing those hook bodies one at a time.
 *
 * `skipHydration` is deliberate: the server renders seed state, the first
 * client render matches it, and the persisted state is folded in afterwards
 * through the subscription in `useStoreHydrated`. No effects, no flash.
 */
import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  API_KEYS,
  FINDINGS,
  INTEGRATIONS,
  MEMBERS,
  MEMORY_RULES,
  ORG_SETTINGS,
  PERSONAL_SETTINGS,
  PULL_REQUESTS,
  REPOS,
  REPO_CLUSTERS,
} from "@/lib/data/seed";
import { NOW } from "@/lib/utils";
import type {
  ApiKey,
  Finding,
  Integration,
  IntegrationProvider,
  Member,
  MemoryRule,
  OrgSettings,
  PersonalSettings,
  PullRequest,
  RepoCluster,
  Repository,
} from "@/lib/types";

export interface PrFilterState {
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
  repos: Repository[];
  pullRequests: PullRequest[];
  findings: Finding[];
  memoryRules: MemoryRule[];
  repoClusters: RepoCluster[];
  integrations: Integration[];
  members: Member[];
  apiKeys: ApiKey[];
  orgSettings: OrgSettings;
  personalSettings: PersonalSettings;
  /** Persisted so chips survive a hard navigation — SPEC §3. */
  prFilters: PrFilterState;

  setRepoEnabled: (repoId: string, enabled: boolean) => void;
  retriggerReviews: (prIds: string[]) => void;
  createMemoryRule: (input: NewMemoryRule) => string;
  updateMemoryRule: (id: string, patch: Partial<MemoryRule>) => void;
  deleteMemoryRule: (id: string) => void;
  createRepoCluster: (name: string, memberRepoIds: string[]) => string;
  deleteRepoCluster: (id: string) => void;
  connectIntegration: (provider: IntegrationProvider) => void;
  disconnectIntegration: (id: string) => void;
  inviteMember: (email: string) => void;
  removeMember: (id: string) => void;
  createApiKey: (name: string) => string;
  deleteApiKey: (id: string) => void;
  updateOrgSettings: (patch: Partial<OrgSettings>) => void;
  updatePersonalSettings: (patch: Partial<PersonalSettings>) => void;
  setPrFilters: (patch: Partial<PrFilterState>) => void;
  clearPrFilters: () => void;
  reset: () => void;
}

export interface NewMemoryRule {
  description: string;
  kind: MemoryRule["kind"];
  pattern: string;
  repoId: string | null;
  fileGlob: string;
}

const EMPTY_FILTERS: PrFilterState = { search: "" };

function seedState() {
  return {
    repos: REPOS.map((r) => ({ ...r })),
    pullRequests: PULL_REQUESTS.map((p) => ({ ...p })),
    findings: FINDINGS.map((f) => ({ ...f })),
    memoryRules: MEMORY_RULES.map((m) => ({ ...m })),
    repoClusters: REPO_CLUSTERS.map((c) => ({ ...c })),
    integrations: INTEGRATIONS.map((i) => ({ ...i })),
    members: MEMBERS.map((m) => ({ ...m })),
    apiKeys: API_KEYS.map((k) => ({ ...k })),
    orgSettings: { ...ORG_SETTINGS },
    personalSettings: { ...PERSONAL_SETTINGS },
    prFilters: { ...EMPTY_FILTERS },
  };
}

let counter = 0;
const nextId = (prefix: string) => `${prefix}_local_${++counter}`;

export const useDataStore = create<DataState>()(
  persist(
    (set) => ({
      ...seedState(),

      setRepoEnabled: (repoId, enabled) =>
        set((s) => ({
          repos: s.repos.map((r) => (r.id === repoId ? { ...r, enabled } : r)),
        })),

      retriggerReviews: (prIds) =>
        set((s) => ({
          pullRequests: s.pullRequests.map((pr) =>
            prIds.includes(pr.id)
              ? { ...pr, status: "pending", reviewCount: pr.reviewCount + 1 }
              : pr,
          ),
        })),

      createMemoryRule: (input) => {
        const id = nextId("mem");
        set((s) => ({
          memoryRules: [
            {
              id,
              description: input.description,
              kind: input.kind,
              pattern: input.pattern,
              files: [],
              repoId: input.repoId,
              fileGlob: input.fileGlob,
              status: "active",
              usageCount: 0,
              usesThisMonth: 0,
              acceptanceRate: null,
              upvotes: 0,
              downvotes: 0,
              createdAt: NOW,
              updatedAt: NOW,
            },
            ...s.memoryRules,
          ],
        }));
        return id;
      },

      updateMemoryRule: (id, patch) =>
        set((s) => ({
          memoryRules: s.memoryRules.map((m) =>
            m.id === id ? { ...m, ...patch, updatedAt: NOW } : m,
          ),
        })),

      deleteMemoryRule: (id) =>
        set((s) => ({
          memoryRules: s.memoryRules.filter((m) => m.id !== id),
        })),

      createRepoCluster: (name, memberRepoIds) => {
        const id = nextId("cluster");
        set((s) => ({
          repoClusters: [
            ...s.repoClusters,
            { id, name, memberRepoIds, createdAt: NOW },
          ],
        }));
        return id;
      },

      deleteRepoCluster: (id) =>
        set((s) => ({
          repoClusters: s.repoClusters.filter((c) => c.id !== id),
        })),

      connectIntegration: (provider) =>
        set((s) =>
          s.integrations.some((i) => i.provider === provider)
            ? s
            : {
                integrations: [
                  ...s.integrations,
                  {
                    id: nextId("integration"),
                    provider,
                    status: "connected" as const,
                    connectedAt: NOW,
                  },
                ],
              },
        ),

      disconnectIntegration: (id) =>
        set((s) => ({
          integrations: s.integrations.filter((i) => i.id !== id),
        })),

      inviteMember: (email) =>
        set((s) =>
          s.members.some((m) => m.email === email)
            ? s
            : {
                members: [
                  ...s.members,
                  {
                    id: nextId("member"),
                    email,
                    name: email.split("@")[0],
                    role: "member" as const,
                    avatarSeed: email,
                    isYou: false,
                  },
                ],
              },
        ),

      removeMember: (id) =>
        set((s) => ({ members: s.members.filter((m) => m.id !== id) })),

      createApiKey: (name) => {
        const id = nextId("key");
        set((s) => ({
          apiKeys: [
            {
              id,
              name,
              keyId: `grp_${id.replace(/\W/g, "").slice(-16).padStart(16, "0")}`,
              createdAt: NOW,
            },
            ...s.apiKeys,
          ],
        }));
        return id;
      },

      deleteApiKey: (id) =>
        set((s) => ({ apiKeys: s.apiKeys.filter((k) => k.id !== id) })),

      updateOrgSettings: (patch) =>
        set((s) => ({ orgSettings: { ...s.orgSettings, ...patch } })),

      updatePersonalSettings: (patch) =>
        set((s) => ({
          personalSettings: { ...s.personalSettings, ...patch },
        })),

      setPrFilters: (patch) =>
        set((s) => ({ prFilters: { ...s.prFilters, ...patch } })),

      clearPrFilters: () => set({ prFilters: { ...EMPTY_FILTERS } }),

      reset: () => set(seedState()),
    }),
    { name: "greptile-clone", version: 1, skipHydration: true },
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
