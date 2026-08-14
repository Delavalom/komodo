"use client";

import type {
  JudgementThread,
  QueueEntry,
  ReviewActions,
  ReviewJudgements,
} from "@komodo/core/store";
import { ReviewList } from "./components/ReviewList";
import { ReviewDetail } from "./components/ReviewDetail";
import { CloseScreen } from "./flow/CloseScreen";
import { JudgeFlow } from "./flow/JudgeFlow";
import { QueueScreen } from "./flow/QueueScreen";
import { ThreadScreen } from "./flow/ThreadScreen";
import { localStore } from "./local-store";
import { NavProvider, type NavAdapter, type NavLinkProps } from "./nav";
import { invalidate, useHash, useResource } from "./store";

const STATE_MSG = "py-16 px-6 text-center text-sm leading-[1.7]";

/**
 * Hash-based navigation, the CLI viewer's half of the NavAdapter port. The
 * cloud app supplies a Next-router-backed adapter for the same components.
 */
const navAdapter: NavAdapter = {
  Link: ({ href, className, style, children }: NavLinkProps) => (
    <a href={`#${href}`} className={className} style={style}>
      {children}
    </a>
  ),
  push: (href) => {
    window.location.hash = `#${href}`;
  },
  refresh: invalidate,
};

/**
 * Every mutation re-reads what is on screen. The cloud app gets this from
 * `revalidatePath` after a server action; here it has to be asked for.
 */
const actions: ReviewActions = {
  answer: async (id, i) => {
    await localStore.answer(id, i);
    invalidate();
  },
  undoAnswer: async (id) => {
    await localStore.undoAnswer(id);
    invalidate();
  },
  ask: async (id, note, blocking) => {
    const result = await localStore.ask(id, note, blocking);
    invalidate();
    return result;
  },
  closeThread: async (id) => {
    await localStore.closeThread(id);
    invalidate();
  },
  postReview: async (id) => {
    const result = await localStore.postReview(id);
    invalidate();
    return result;
  },
};

function Loading({ what }: { what: string }) {
  return <div className={`${STATE_MSG} text-text-muted`}>Loading {what}…</div>;
}

function Failed({ error }: { error: string }) {
  return <div className={`${STATE_MSG} text-critical`}>{error}</div>;
}

function QueueRoute() {
  const state = useResource<QueueEntry[]>("queue", () => localStore.loadQueue());
  if (state.status === "loading") return <Loading what="your queue" />;
  if (state.status === "error") return <Failed error={state.error} />;
  return <QueueScreen entries={state.data} />;
}

function JudgeRoute({ id, at }: { id: string; at: number | null }) {
  const state = useResource<ReviewJudgements | null>(`judge:${id}`, () =>
    localStore.loadReviewJudgements(id),
  );
  if (state.status === "loading") return <Loading what="this review" />;
  if (state.status === "error") return <Failed error={state.error} />;
  if (!state.data) return <Failed error="Review not found." />;

  const { review, judgements } = state.data;
  if (!judgements.length) return <Failed error="This review raised no judgements." />;

  const startAt =
    at !== null && at >= 0 && at < judgements.length
      ? at
      : Math.max(
          0,
          judgements.findIndex((j) => j.bucket === null),
        );

  return (
    <JudgeFlow
      reviewId={review.id}
      prLabel={`#${review.number} · ${review.title}`}
      rows={judgements}
      startAt={startAt}
      actions={actions}
    />
  );
}

function CloseRoute({ id }: { id: string }) {
  const state = useResource<ReviewJudgements | null>(`judge:${id}`, () =>
    localStore.loadReviewJudgements(id),
  );
  if (state.status === "loading") return <Loading what="this review" />;
  if (state.status === "error") return <Failed error={state.error} />;
  if (!state.data) return <Failed error="Review not found." />;
  return <CloseScreen loaded={state.data} actions={actions} />;
}

function ThreadRoute({ id }: { id: string }) {
  const state = useResource<JudgementThread | null>(`thread:${id}`, () =>
    localStore.loadThread(id),
  );
  if (state.status === "loading") return <Loading what="this thread" />;
  if (state.status === "error") return <Failed error={state.error} />;
  if (!state.data) return <Failed error="Thread not found." />;
  return <ThreadScreen thread={state.data} actions={actions} />;
}

/** The read-only viewer's own chrome. The focus screens supply their own. */
function ViewerShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between h-14 px-6 border-b border-border bg-surface mb-8 max-[800px]:px-4">
        <div className="flex items-center gap-2">
          <span className="text-xl leading-none">🦎</span>
          <span className="text-base font-semibold tracking-[-0.02em] text-text">Komodo</span>
          <span className="text-xs text-text-dim ml-0.5">Review Viewer</span>
        </div>
        <a href="#/queue" className="text-[13px] text-text-muted hover:text-text transition-colors">
          Your queue →
        </a>
      </header>
      <main className="max-w-[1100px] mx-auto px-6 pb-20 max-[800px]:px-4 max-[800px]:pb-15">
        {children}
      </main>
    </div>
  );
}

function Router() {
  const hash = useHash();
  const [path, query] = hash.replace(/^#/, "").split("?");
  const at = new URLSearchParams(query ?? "").get("at");

  if (path === "/queue") return <QueueRoute />;

  const judge = /^\/reviews\/(.+)\/judge$/.exec(path);
  if (judge) {
    const parsed = Number(at);
    return (
      <JudgeRoute
        id={decodeURIComponent(judge[1])}
        at={Number.isInteger(parsed) ? parsed : null}
      />
    );
  }

  const close = /^\/reviews\/(.+)\/close$/.exec(path);
  if (close) return <CloseRoute id={decodeURIComponent(close[1])} />;

  const thread = /^\/judgements\/(.+)\/thread$/.exec(path);
  if (thread) return <ThreadRoute id={decodeURIComponent(thread[1])} />;

  const detail = /^\/reviews\/(.+)$/.exec(path);
  if (detail) {
    return (
      <ReviewDetail
        id={decodeURIComponent(detail[1])}
        onBack={() => {
          window.location.hash = "#/";
        }}
      />
    );
  }

  return (
    <ViewerShell>
      <ReviewList />
    </ViewerShell>
  );
}

export default function App() {
  return (
    <NavProvider adapter={navAdapter}>
      <div className="min-h-screen flex flex-col">
        <Router />
      </div>
    </NavProvider>
  );
}
