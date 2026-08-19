"use client";

/**
 * Write seam. docs/SPEC.md §12.
 *
 * Writes against store-owned entities forward to the server actions in
 * lib/data/actions.ts, so they land in the shared database and revalidate for
 * everyone. The rest still write local state. Callers see one hook either way.
 */
import * as actions from "@/lib/data/actions";
import { useDataStore } from "@/lib/data/store";

export const useSetRepoEnabled = () => actions.setRepoEnabled;

export const useRetriggerReviews = () => actions.retriggerReviews;

/** convex: api.memory.create({ description, kind, pattern, scope }) */
export const useCreateMemoryRule = () =>
  useDataStore((s) => s.createMemoryRule);

/** convex: api.memory.update({ id, patch }) */
export const useUpdateMemoryRule = () =>
  useDataStore((s) => s.updateMemoryRule);

/** convex: api.memory.remove({ id }) */
export const useDeleteMemoryRule = () =>
  useDataStore((s) => s.deleteMemoryRule);

/** convex: api.repoClusters.create({ name, memberRepoIds }) */
export const useCreateRepoCluster = () =>
  useDataStore((s) => s.createRepoCluster);

/** convex: api.repoClusters.remove({ id }) */
export const useDeleteRepoCluster = () =>
  useDataStore((s) => s.deleteRepoCluster);

/** convex: api.integrations.connect({ provider }) */
export const useConnectIntegration = () =>
  useDataStore((s) => s.connectIntegration);

/** convex: api.integrations.disconnect({ id }) */
export const useDisconnectIntegration = () =>
  useDataStore((s) => s.disconnectIntegration);

export const useInviteMember = () => actions.inviteMember;

export const useRemoveMember = () => actions.removeMember;

/** convex: api.apiKeys.create({ name }) */
export const useCreateApiKey = () => useDataStore((s) => s.createApiKey);

/** convex: api.apiKeys.remove({ id }) */
export const useDeleteApiKey = () => useDataStore((s) => s.deleteApiKey);

/** convex: api.settings.updateOrg({ orgId, patch }) */
export const useUpdateOrgSettings = () =>
  useDataStore((s) => s.updateOrgSettings);

/** convex: api.settings.updatePersonal({ userId, patch }) */
export const useUpdatePersonalSettings = () =>
  useDataStore((s) => s.updatePersonalSettings);

/** Local view state, never a Convex call — see SPEC §3 on chip persistence. */
export const useSetJudgmentFilters = () => useDataStore((s) => s.setJudgmentFilters);
export const useClearJudgmentFilters = () => useDataStore((s) => s.clearJudgmentFilters);
