"use client";

/**
 * The review's own header: which pull request, which run, and which view.
 *
 * The run switcher is the visible half of "every run is kept". A PR reviewed
 * after three pushes has three runs here, each pinned to the head it read, and
 * picking one opens exactly what Komodo thought at that point — along with the
 * answers given against it.
 */
import * as React from "react";
import Link from "next/link";
import { Eye } from "lucide-react";

import { canRequestAiReview } from "@komodo/store";
import { Avatar, GithubIcon } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/controls";
import { useUrlState } from "@/lib/use-url-state";
import { cn, relativeTime } from "@/lib/utils";
import { useNow } from "@/lib/data/provider";
import { usePullRequestWatch } from "@/lib/data/queries";
import {
  useRequestAIReview,
  useUnwatchPullRequest,
  useUpdateWatchMode,
  useWatchPullRequest,
} from "@/lib/data/mutations";
import type { AiState, PullRequest, Review, WatchMode } from "@/lib/types";

const WATCH_MODE_OPTIONS: { value: WatchMode; label: string }[] = [
  { value: "notify", label: "Notify only" },
  { value: "notify_and_draft", label: "Notify + draft reply" },
];

/**
 * Watch this pull request for new comments, and choose how far Komodo goes
 * when one lands — see AGENTS.md rule 15: even in "draft" mode this only
 * writes a suggestion into the PR Watchers queue, never a GitHub comment.
 */
function WatchControl({ prId }: { prId: string }) {
  const watch = usePullRequestWatch(prId);
  const startWatching = useWatchPullRequest();
  const stopWatching = useUnwatchPullRequest();
  const changeMode = useUpdateWatchMode();

  return (
    <div className="flex items-center gap-2">
      {watch ? (
        <Select
          value={watch.mode}
          onChange={(mode) => changeMode(watch.id, mode)}
          options={WATCH_MODE_OPTIONS}
        />
      ) : null}
      <button
        type="button"
        onClick={() => (watch ? stopWatching(watch.id) : startWatching(prId, "notify"))}
        aria-pressed={!!watch}
        title={watch ? "Stop watching this pull request" : "Watch for new comments"}
        className={cn(
          "flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition-colors",
          watch
            ? "border-[hsl(var(--accent))] text-[hsl(var(--accent))]"
            : "border-border text-muted-foreground hover:text-foreground",
        )}
      >
        <Eye className="size-3.5" />
        {watch ? "Watching" : "Watch"}
      </button>
    </div>
  );
}

export function ReviewHeader({
  pr,
  repoFullName,
  runs,
  current,
  orgSlug,
  estimate,
  aiState,
}: {
  pr: PullRequest;
  repoFullName: string;
  runs: Review[];
  current: Review | null;
  orgSlug: string;
  estimate: string;
  aiState: AiState;
}) {
  const now = useNow();
  const { get, set } = useUrlState();
  const requestedView = get("view");
  const view =
    requestedView === "whole"
      ? "whole"
      : requestedView === "decisions"
        ? "decisions"
        : requestedView === "conversation"
          ? "conversation"
          : "verify";
  const isLatest = !current || runs[0]?.id === current.id;

  return (
    <div className="border-b border-border">
      <div className="flex items-start gap-3 px-6 pt-4">
        <Avatar seed={repoFullName} label={repoFullName} size={18} className="mt-1" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              href={`/${orgSlug}/-/pull-requests`}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Pull requests
            </Link>
            <span className="text-xs text-muted-foreground">/</span>
            <span className="text-xs text-muted-foreground">
              {repoFullName} #{pr.number}
            </span>
          </div>
          <h1 className="mt-1 truncate text-[17px]">{pr.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span>{pr.author}</span>
            <span>·</span>
            <span>{pr.changedFiles} files</span>
            <span>·</span>
            <span className="text-[hsl(var(--accent))]">+{pr.additions}</span>
            <span className="text-[hsl(var(--destructive))]">−{pr.deletions}</span>
            {current ? (
              <>
                <span>·</span>
                <span>{estimate} to answer</span>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {runs.length > 1 ? (
            <Select
              value={current?.id ?? runs[0]?.id ?? ""}
              onChange={(id) => {
                const run = runs.find((r) => r.id === id);
                // The newest run is the default, so it writes no param —
                // matching how every other view here encodes its default.
                set({
                  run: run && runs[0]?.id === run.id ? null : run?.headSha,
                  j: null,
                });
              }}
              options={runs.map((run, i) => ({
                value: run.id,
                label: `${run.headSha.slice(0, 7)} · ${relativeTime(run.createdAt, now)}${
                  i === 0 ? " · latest" : ""
                }`,
              }))}
            />
          ) : null}
          <WatchControl prId={pr.id} />
          <a
            href={pr.url}
            target="_blank"
            rel="noreferrer"
            aria-label="Open on GitHub"
            title="Open on GitHub"
            className="p-1.5 text-muted-foreground hover:text-foreground"
          >
            <GithubIcon className="size-4" />
          </a>
        </div>
      </div>

      {isLatest ? null : (
        <p className="mt-3 border-t border-border bg-muted-accent/40 px-6 py-1.5 text-xs text-muted-foreground">
          Showing an earlier run. The head has moved since — answers here stay
          on the record.
        </p>
      )}

      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <nav className="flex gap-1">
          <Tab active={view === "verify"} onClick={() => set({ view: null, j: null })}>
            Verify result
          </Tab>
          <Tab
            active={view === "decisions"}
            onClick={() => set({ view: "decisions" })}
          >
            Decisions
          </Tab>
          <Tab active={view === "whole"} onClick={() => set({ view: "whole" })}>
            The whole review
          </Tab>
          <Tab
            active={view === "conversation"}
            onClick={() => set({ view: "conversation" })}
          >
            Conversation
          </Tab>
        </nav>
        {canRequestAiReview(aiState) ? (
          <AskAIReviewButton prId={pr.id} headSha={pr.headSha} />
        ) : null}
      </div>
    </div>
  );
}

/** Same request the queue's row button makes — see `view.tsx`'s "Review with AI". */
function AskAIReviewButton({ prId, headSha }: { prId: string; headSha: string }) {
  const requestReview = useRequestAIReview();
  const [requesting, startRequest] = React.useTransition();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={requesting}
      onClick={() => startRequest(() => requestReview(prId, headSha))}
    >
      {requesting ? "Queuing…" : "Ask AI review"}
    </Button>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "border-b-2 px-2 pb-2 text-[13px] transition-colors",
        active
          ? "border-foreground text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
