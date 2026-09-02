"use client";

/**
 * The review's own header: which pull request, which run, and which view.
 *
 * The run switcher is the visible half of "every run is kept". A PR reviewed
 * after three pushes has three runs here, each pinned to the head it read, and
 * picking one opens exactly what Komodo thought at that point — along with the
 * answers given against it.
 */
import Link from "next/link";

import { Avatar, GithubIcon } from "@/components/ui/display";
import { Select } from "@/components/ui/controls";
import { useUrlState } from "@/lib/use-url-state";
import { cn, relativeTime } from "@/lib/utils";
import { useNow } from "@/lib/data/provider";
import type { PullRequest, Review } from "@/lib/types";

export function ReviewHeader({
  pr,
  repoFullName,
  runs,
  current,
  orgSlug,
  estimate,
}: {
  pr: PullRequest;
  repoFullName: string;
  runs: Review[];
  current: Review | null;
  orgSlug: string;
  estimate: string;
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

      <nav className="flex gap-1 px-4 pt-3">
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
    </div>
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
