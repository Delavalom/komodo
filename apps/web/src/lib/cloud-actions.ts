"use client";

import type { ReviewActions } from "@komodo/core";
import {
  answerJudgement,
  askQuestion,
  closeThread,
  postReview,
  undoAnswer,
} from "@/app/(focus)/actions";

/**
 * The write half of the port, bound to Next server actions.
 *
 * This is the cloud implementation of ReviewActions: the shared judge, thread
 * and close screens in packages/ui take a ReviewActions and never learn whether
 * their calls end up in Postgres or in a local .komodo/reviews file.
 */
export const cloudActions: ReviewActions = {
  answer: answerJudgement,
  undoAnswer,
  ask: askQuestion,
  closeThread,
  postReview,
};
