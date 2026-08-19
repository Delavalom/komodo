"use client";

/**
 * Write seam. docs/SPEC.md §12.
 *
 * Each hook is named after the Convex mutation it becomes. Today they return
 * store actions; tomorrow they return `useMutation(api.…)`. Callers don't move.
 */
import { useDataStore } from "@/lib/data/store";

/** convex: api.repos.setEnabled({ repoId, enabled }) */
export const useSetRepoEnabled = () => useDataStore((s) => s.setRepoEnabled);

/** convex: api.pullRequests.retrigger({ prIds }) */
export const useRetriggerReviews = () =>
  useDataStore((s) => s.retriggerReviews);

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

/** convex: api.members.invite({ email }) */
export const useInviteMember = () => useDataStore((s) => s.inviteMember);

/** convex: api.members.remove({ id }) */
export const useRemoveMember = () => useDataStore((s) => s.removeMember);

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
export const useSetPrFilters = () => useDataStore((s) => s.setPrFilters);
export const useClearPrFilters = () => useDataStore((s) => s.clearPrFilters);
