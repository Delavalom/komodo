"use client";

import type {
  AskResult,
  JudgementThread,
  PostResult,
  QueueEntry,
  ReviewActions,
  ReviewJudgements,
  ReviewStore,
} from "@komodo/core/store";

/**
 * The CLI viewer's implementation of the ReviewStore port: HTTP against the
 * local server in `komodo-review ui`, which reads and writes
 * `.komodo/reviews/<id>.json`.
 *
 * The cloud app implements the same port with server actions over Postgres.
 * Neither shape reaches the shared screens.
 */

async function get<T>(path: string): Promise<T | null> {
  const res = await fetch(`/api/store${path}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await errorFrom(res));
  return (await res.json()) as T;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/store${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorFrom(res));
  return (await res.json()) as T;
}

async function errorFrom(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    // fall through to the status line
  }
  return `Request failed (${res.status}).`;
}

export const localStore: ReviewStore = {
  loadQueue: () => get<QueueEntry[]>("/queue").then((r) => r ?? []),
  loadReviewJudgements: (reviewId) =>
    get<ReviewJudgements>(`/reviews/${encodeURIComponent(reviewId)}`),
  loadThread: (judgementId) =>
    get<JudgementThread>(`/judgements/${encodeURIComponent(judgementId)}/thread`),

  answer: (judgementId, optionIndex) => post("/answer", { judgementId, optionIndex }),
  undoAnswer: (judgementId) => post("/undo", { judgementId }),
  ask: (judgementId, note, blocking) =>
    post<AskResult>("/ask", { judgementId, note, blocking }),
  closeThread: (judgementId) => post("/close-thread", { judgementId }),
  postReview: (reviewId) => post<PostResult>("/post-review", { reviewId }),
};

/** The write half on its own, for components that only mutate. */
export const localActions: ReviewActions = localStore;
