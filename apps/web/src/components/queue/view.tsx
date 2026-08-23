"use client";

/**
 * The team review queue.
 *
 * This is the screen the whole product is for. GitHub's "Review requested" tab
 * tells you a PR is waiting; a Slack channel tells you it existed. Neither
 * tells you which one to pick up. Every row here arrives pre-triaged — verdict,
 * size, how long it has waited, and its worst findings — so that choice takes
 * a glance instead of opening four diffs.
 *
 * Rows sort by longest wait, not most recent: the queue's job is to surface
 * what is going stale.
 */
import * as React from "react";
import { AlertTriangle, GitBranch, ShieldAlert, User } from "lucide-react";

import { Avatar, Badge, StatusPill } from "@/components/ui/display";
import { FilterInput, type FacetDef } from "@/components/ui/filter-input";
import { DataTable, EmptyRow, TD, TH, THead, TR } from "@/components/ui/table";
import {
  fullName,
  useAuthors,
  useMe,
  useQueue,
  useQueueCounts,
  useRepositories,
} from "@/lib/data/queries";
import { useUrlState } from "@/lib/use-url-state";
import { absoluteStamp, cn, plural, relativeTime } from "@/lib/utils";
import type { QueueLens, QueueRow, Verdict } from "@/lib/types";

const LENSES: { key: QueueLens; label: string; hint: string }[] = [
  { key: "mine", label: "Needs my review", hint: "Waiting on you" },
  { key: "all", label: "All open", hint: "Every open pull request" },
  { key: "blocked", label: "Blocked", hint: "Changes requested, or Komodo says no" },
  { key: "stale", label: "Stale", hint: "Untouched for three days or more" },
];

const VERDICT_LABEL: Record<Verdict, string> = {
  ship: "Ship",
  ship_with_notes: "Ship with notes",
  needs_work: "Needs work",
  blocked: "Blocked",
};

const VERDICT_TONE: Record<Verdict, "default" | "warn" | "error" | "success"> = {
  ship: "success",
  ship_with_notes: "default",
  needs_work: "warn",
  blocked: "error",
};

export function QueueView() {
  const { get, set } = useUrlState();
  const repos = useRepositories();
  const authors = useAuthors();
  const me = useMe();

  const [search, setSearch] = React.useState("");
  const lens = (get("lens") as QueueLens | null) ?? "mine";
  const active: Record<string, string> = {};
  for (const key of ["author", "repo"]) {
    const value = get(key);
    if (value) active[key] = value;
  }

  const counts = useQueueCounts({
    search,
    author: active.author,
    repo: active.repo,
  });
  const rows = useQueue({
    lens,
    search,
    author: active.author,
    repo: active.repo,
  });

  const facets: FacetDef[] = [
    {
      key: "author",
      example: "Author Name",
      icon: <User className="h-3.5 w-3.5" />,
      loadValues: () => authors.map((a) => ({ value: a, label: a })),
    },
    {
      key: "repo",
      example: "Repo Name",
      icon: <GitBranch className="h-3.5 w-3.5" />,
      loadValues: () =>
        repos.map((r) => ({ value: fullName(r), label: fullName(r) })),
    },
  ];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[1216px] px-5 py-6">
        <header className="mb-5">
          <h1 className="text-lg font-medium">Review queue</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {me
              ? `Open pull requests across your team's repositories, ${me.name}.`
              : "Open pull requests across your team's repositories."}
          </p>
        </header>

        <nav
          aria-label="Queue filters"
          className="mb-4 flex flex-wrap items-center gap-1 border-b border-border"
        >
          {LENSES.map(({ key, label, hint }) => (
            <button
              key={key}
              type="button"
              title={hint}
              aria-current={lens === key ? "page" : undefined}
              onClick={() => set({ lens: key === "mine" ? null : key })}
              className={cn(
                "-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors",
                lens === key
                  ? "border-[hsl(var(--accent))] text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
              <Badge tone={lens === key ? "brand" : "muted"}>
                {counts[key]}
              </Badge>
            </button>
          ))}
        </nav>

        <FilterInput
          facets={facets}
          active={active}
          onChange={(key, value) => set({ [key]: value })}
          search={search}
          onSearchChange={setSearch}
          placeholder="Search the queue or click to add filters"
        />

        <DataTable>
          <THead>
            <tr>
              <TH>Pull request</TH>
              <TH className="w-[150px]">Komodo</TH>
              <TH className="w-[104px]">Size</TH>
              <TH className="w-[132px]">Waiting</TH>
            </tr>
          </THead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={4}>{emptyMessage(lens)}</EmptyRow>
            ) : (
              rows.map((row) => <QueueRowCells key={row.id} row={row} />)
            )}
          </tbody>
        </DataTable>
      </div>
    </div>
  );
}

function emptyMessage(lens: QueueLens): string {
  switch (lens) {
    case "mine":
      return "Nothing is waiting on you.";
    case "blocked":
      return "Nothing is blocked.";
    case "stale":
      return "Nothing has gone stale.";
    default:
      return "No open pull requests.";
  }
}

function QueueRowCells({ row }: { row: QueueRow }) {
  return (
    <TR>
      <TD className="py-3">
        <div className="flex items-start gap-2">
          <Avatar seed={row.author} label={row.author} size={16} className="mt-0.5" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <a
                href={row.url}
                target="_blank"
                rel="noreferrer"
                className="truncate text-[15px] transition-colors hover:text-[hsl(var(--accent))]"
              >
                {row.title}
              </a>
              {row.needsMyReview ? <Badge>Your review</Badge> : null}
              {row.isBlocked ? <Badge tone="outline">Blocked</Badge> : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
              <span>{row.repoFullName}</span>
              <span>·</span>
              <span>#{row.number}</span>
              <span>·</span>
              <span>{row.author}</span>
              {row.requestedReviewers.length > 0 ? (
                <>
                  <span>·</span>
                  <span>
                    {plural(row.requestedReviewers.length, "reviewer")} asked
                  </span>
                </>
              ) : null}
            </div>
            {row.topFindings.length > 0 ? (
              <ul className="mt-1.5 space-y-0.5">
                {row.topFindings.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground"
                  >
                    {f.isSecurity ? (
                      <ShieldAlert className="h-3 w-3 shrink-0 text-[hsl(var(--error))]" />
                    ) : (
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                    )}
                    <span className="label-mono text-[10px]">{f.severity}</span>
                    <span className="truncate">{f.title}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </TD>
      <TD>
        {row.verdict ? (
          <>
            <StatusPill tone={VERDICT_TONE[row.verdict]}>
              {VERDICT_LABEL[row.verdict]}
            </StatusPill>
            <div className="mt-1 text-xs text-muted-foreground">
              {row.score}/5 confidence
            </div>
          </>
        ) : (
          <StatusPill>Not reviewed</StatusPill>
        )}
      </TD>
      <TD>
        <span className="label-mono text-[11px]">{row.sizeLabel}</span>
        <div className="mt-1 text-xs text-muted-foreground">
          {plural(row.changedLines, "line")}
        </div>
      </TD>
      <TD title={absoluteStamp(row.updatedAt)}>
        <span className={cn(row.isStale && "text-[hsl(var(--warn))]")}>
          {relativeTime(row.updatedAt)}
        </span>
        <div className="mt-1 text-xs text-muted-foreground">
          {plural(row.changedFiles, "file")}
        </div>
      </TD>
    </TR>
  );
}
