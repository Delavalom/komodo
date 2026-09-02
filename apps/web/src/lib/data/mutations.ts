"use client";

/**
 * Write seam.
 *
 * Writes against store-owned entities forward to the server actions in
 * lib/data/actions.ts, so they land in the shared database and revalidate for
 * everyone. The rest still write local state. Callers see one hook either way.
 */
import * as actions from "@/lib/data/actions";
import { useDataStore } from "@/lib/data/store";

export const useSetRepoEnabled = () => actions.setRepoEnabled;

export const useRetriggerReviews = () => actions.retriggerReviews;

export const useRequestAIReview = () => actions.requestAIReview;

export const useRescanRepositories = () => actions.rescanRepositories;

export const useCreateMemoryRule = () => actions.createMemoryRule;

export const useUpdateMemoryRule = () => actions.updateMemoryRule;

export const useDeleteMemoryRule = () => actions.deleteMemoryRule;

export const useCreateRepoCluster = () => actions.createRepoCluster;

export const useDeleteRepoCluster = () => actions.deleteRepoCluster;

export const useConnectIntegration = () => actions.connectIntegration;

export const useDisconnectIntegration = () => actions.disconnectIntegration;

export const useInviteMember = () => actions.inviteMember;

export const useUpdateMember = () => actions.updateMember;

export const useRemoveMember = () => actions.removeMember;

export const useCreateApiKey = () => actions.createApiKey;

export const useDeleteApiKey = () => actions.deleteApiKey;

export const useUpdateOrgSettings = () => actions.updateOrgSettings;

export const useUpdatePersonalSettings = () =>
  useDataStore((s) => s.updatePersonalSettings);

/** Local view state, never a Convex call — see on chip persistence. */
export const useSetJudgmentFilters = () => useDataStore((s) => s.setJudgmentFilters);
export const useClearJudgmentFilters = () => useDataStore((s) => s.clearJudgmentFilters);

export const useAnswerJudgement = () => actions.answerJudgement;

export const useRecordVerification = () => actions.recordVerification;

export const useVoteJudgement = () => actions.voteJudgement;

/** Re-reads one pull request's conversation from GitHub, on demand. */
export const useRefreshConversation = () => actions.refreshConversation;

/** Says something on the pull request, from inside the review. */
export const usePostConversationComment = () => actions.postConversationComment;

/** Connects, or forgets, this person's own GitHub credential. */
export const useConnectGithubIdentity = () => actions.connectGithubIdentity;
export const useDisconnectGithubIdentity = () => actions.disconnectGithubIdentity;

/** The one call that can produce a GitHub approval, and only as a person. */
export const useSubmitGithubReview = () => actions.submitGithubReview;

/**
 * Says which member of the roster is at this browser.
 *
 * Not a sign-in — Komodo has none. It decides whose name the decision ledger
 * records, which is what stops a shared deployment filing four people's calls
 * under one.
 */
export const useSetActor = () => actions.setActor;

export const usePostReceipt = () => actions.postReceipt;
