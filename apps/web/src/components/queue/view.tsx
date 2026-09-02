"use client";

/**
 * The team review queue.
 *
 * This is the screen the whole product is for. GitHub's "Review requested" tab
 * tells you a PR is waiting; a Slack channel tells you it existed. Neither
 * tells you which one to pick up. Every row separates AI preflight, result
 * evidence, and human review so a model's clean-looking diff cannot become an
 * approval by implication. Size, age, and open concerns still help triage at
 * a glance instead of opening four diffs.
 *
 * Rows sort by longest wait, not most recent: the queue's job is to surface
 * what is going stale.
 */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ChevronRight,
  GitBranch,
  RefreshCw,
  ShieldAlert,
  User,
  XCircle,
} from "lucide-react";

import { Avatar, Badge, StatusPill } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { FilterInput, type FacetDef } from "@/components/ui/filter-input";
import { DataTable, EmptyRow, TD, TH, THead, TR } from "@/components/ui/table";
import {
  fullName,
  useAuthors,
  useMe,
  useMembers,
  useOrganization,
  useQueue,
  useQueueCounts,
  useRepositories,
} from "@/lib/data/queries";
import { useUrlState } from "@/lib/use-url-state";
import { useRequestAIReview } from "@/lib/data/mutations";
import { absoluteStamp, cn, plural, relativeTime } from "@/lib/utils";
import { useNow } from "@/lib/data/provider";
import type { ChecksState, EasyWinSignal, QueueLens, QueueRow } from "@/lib/types";

const LENSES: { key: QueueLens; label: string; hint: string }[] = [
  {
    key: "mine",
    label: "Needs my review",
    hint: "Open pull requests by a teammate, or that GitHub has asked you to review",
  },
  {
    key: "easy",
    label: "Easy wins",
    hint: "A green build, a finished brief, and nothing outstanding — cheapest first",
  },
  { key: "all", label: "All open", hint: "Every open pull request" },
  { key: "blocked", label: "Needs action", hint: "Human changes requested, or major AI concerns remain" },
  { key: "stale", label: "Stale", hint: "Untouched for three days or more" },
];

/**
 * What the checks column says.
 *
 * `neutral` is not "fine" and must not read like it: a repository with no CI
 * has not passed anything. Null is a fourth state again — nobody has read a
 * rollup for this head — and calling that "no checks" would be inventing a
 * fact about the repository out of a fact about Komodo.
 */
const CHECKS_LABEL: Record<ChecksState, string> = {
  passing: "Passing",
  failing: "Failing",
  pending: "Running",
  neutral: "No checks",
};

/** Why a row is on the easy-wins list, in the words the screen uses. */
const SIGNAL_LABEL: Record<EasyWinSignal, string> = {
  small: "small",
  few_files: "few files",
  checks_green: "checks green",
  brief_ready: "brief ready",
  no_concerns: "no open concerns",
};

const AI_STATE_LABEL: Record<QueueRow["aiState"], string> = {
  not_requested: "Not requested",
  queued: "Queued",
  running: "Reviewing",
  completed: "Brief ready",
  skipped: "Skipped",
  failed: "Failed",
  cancelled: "Cancelled",
};

const VERIFICATION_LABEL: Record<QueueRow["verificationState"], string> = {
  not_planned: "No plan yet",
  not_required: "No required check",
  needs_evidence: "Evidence needed",
  verified: "Verified",
  failed: "Failed",
  blocked: "Blocked",
};

const HUMAN_LABEL: Record<QueueRow["humanReviewState"], string> = {
  changes_requested: "Changes requested",
  approved: "Approved by human",
  awaiting_review: "Awaiting review",
  unassigned: "Human review needed",
};

export function QueueView() {
  const { get, set } = useUrlState();
  const router = useRouter();
  const repos = useRepositories();
  const authors = useAuthors();
  const me = useMe();
  const members = useMembers();
  const org = useOrganization();
  const now = useNow();
  const [refreshing, startRefresh] = React.useTransition();

  const [search, setSearch] = React.useState("");
  const lens = (get("lens") as QueueLens | null) ?? "mine";
  // In the URL like every other view state, so a link opens on the row being
  // discussed rather than on a collapsed table. AGENTS.md rule 8.
  const openRow = get("open");
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
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-medium">Review queue</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {me
                ? `Open pull requests across your team's repositories, ${me.name}.`
                : "Open pull requests across your team's repositories."}
            </p>
          </div>
          {/* What the poller has written so far, not what GitHub holds right
              now. The two differ by up to a poll interval, and a count that
              says nothing about when it was taken is how "22 open" sits on
              screen while the last pass imported 172. */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>as of {absoluteStamp(now)}</span>
            <Button
              size="sm"
              variant="secondary"
              disabled={refreshing}
              onClick={() => startRefresh(() => router.refresh())}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {refreshing ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
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
              <TH className="w-[124px]">Checks</TH>
              <TH className="w-[132px]">AI preflight</TH>
              <TH className="w-[132px]">Verification</TH>
              <TH className="w-[144px]">Human review</TH>
              <TH className="w-[96px]">Size</TH>
              <TH className="w-[124px]">Waiting</TH>
            </tr>
          </THead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={7}>
                {emptyMessage(lens, {
                  identified: me !== null,
                  teammates: members.length,
                })}
              </EmptyRow>
            ) : (
              rows.map((row) => (
                <QueueRowCells
                  key={row.id}
                  row={row}
                  orgSlug={org.slug}
                  expanded={openRow === row.id}
                  onToggle={() => set({ open: openRow === row.id ? null : row.id })}
                />
              ))
            )}
          </tbody>
        </DataTable>
      </div>
    </div>
  );
}

/**
 * A judgment id is `owner/name#number@sha`, and the route spells the same
 * three parts out in path segments — so a link into a review is readable, and
 * a run can be named without encoding an id into a URL.
 */
function reviewHref(orgSlug: string, row: QueueRow): string {
  const [repoFullName, number] = row.prId.split("#");
  return `/${orgSlug}/-/pull-requests/${repoFullName}/${number}`;
}

/**
 * Why the table is empty, which is not always "there is no work".
 *
 * "Needs my review" needs two things Komodo cannot assume: somebody marked as
 * you, and a roster to compare authors against. Missing either, the lens is
 * unconditionally empty — and answering that with "nothing is waiting on you"
 * is a screen telling a person their queue is clear when what it means is that
 * it never looked.
 */
function emptyMessage(
  lens: QueueLens,
  context: { identified: boolean; teammates: number },
): string {
  switch (lens) {
    case "mine":
      if (!context.identified) {
        return "Nobody is marked as you, so no pull request can be matched to you — pick your name from the account menu in the header.";
      }
      if (context.teammates <= 1) {
        return "This shows pull requests by a teammate, or ones GitHub asked you to review. The roster is just you — add your team under Settings → Team Members.";
      }
      return "Nothing is waiting on you.";
    case "easy":
      // Deliberately does not enumerate why. The list is filtered as well as
      // gated, so "every open pull request has a failing build" is a sentence
      // that can be flatly untrue while this message is on screen.
      return "Nothing here is a quick win. This lens only shows pull requests with a green build, a finished brief, and nothing outstanding.";
    case "blocked":
      return "Nothing is blocked.";
    case "stale":
      return "Nothing has gone stale.";
    default:
      return "No open pull requests.";
  }
}

function QueueRowCells({
  row,
  orgSlug,
  expanded,
  onToggle,
}: {
  row: QueueRow;
  orgSlug: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const now = useNow();
  const requestAIReview = useRequestAIReview();
  const [requesting, startRequest] = React.useTransition();

  return (
    <>
    <TR>
      <TD className="py-3">
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-controls={`queue-detail-${row.id}`}
            aria-label={expanded ? "Hide details" : "Show details"}
            className="mt-0.5 rounded-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--accent))]"
          >
            <ChevronRight
              className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-90")}
            />
          </button>
          <Avatar seed={row.author} label={row.author} size={16} className="mt-0.5" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {/* Into the review, not out to GitHub. The judgements are here,
                  and they are what the row is a summary of. */}
              <Link
                href={reviewHref(orgSlug, row)}
                className="truncate text-[15px] transition-colors hover:text-[hsl(var(--accent))]"
              >
                {row.title}
              </Link>
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
        <ChecksCell row={row} />
      </TD>
      <TD>
        {row.aiState === "completed" ? (
          <>
            <StatusPill tone={row.aiConcernCount > 0 ? "warn" : "default"}>
              Brief ready
            </StatusPill>
            <div className="mt-1 text-xs text-muted-foreground">
              {row.aiConcernCount
                ? plural(row.aiConcernCount, "open concern")
                : "No source concerns"}
            </div>
          </>
        ) : (
          <div className="space-y-1.5">
            <StatusPill
              tone={
                row.aiState === "failed"
                  ? "error"
                  : row.aiState === "queued" || row.aiState === "running"
                    ? "warn"
                    : "default"
              }
            >
              {AI_STATE_LABEL[row.aiState]}
            </StatusPill>
            {[
              "not_requested",
              "failed",
              "skipped",
              "cancelled",
            ].includes(row.aiState) ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={requesting}
                onClick={() =>
                  startRequest(() => requestAIReview(row.id, row.headSha))
                }
              >
                {requesting ? "Queuing…" : "Review with AI"}
              </Button>
            ) : null}
          </div>
        )}
      </TD>
      <TD>
        <StatusPill
          tone={
            row.verificationState === "verified"
              ? "success"
              : row.verificationState === "failed"
                ? "error"
                : row.verificationState === "blocked" ||
                    row.verificationState === "needs_evidence"
                  ? "warn"
                  : "default"
          }
        >
          {VERIFICATION_LABEL[row.verificationState]}
        </StatusPill>
        {row.verificationSummary?.required ? (
          <div className="mt-1 text-xs text-muted-foreground">
            {row.verificationSummary.requiredVerified}/
            {row.verificationSummary.required} required
          </div>
        ) : null}
      </TD>
      <TD>
        <StatusPill
          tone={
            row.humanReviewState === "approved"
              ? "success"
              : row.humanReviewState === "changes_requested"
                ? "error"
                : "warn"
          }
        >
          {HUMAN_LABEL[row.humanReviewState]}
        </StatusPill>
        {row.humanApprovals.length > 0 ? (
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {row.humanApprovals.join(", ")}
          </div>
        ) : null}
      </TD>
      <TD>
        <span className="label-mono text-[11px]">{row.sizeLabel}</span>
        <div className="mt-1 text-xs text-muted-foreground">
          {plural(row.changedLines, "line")}
        </div>
      </TD>
      <TD title={absoluteStamp(row.updatedAt)}>
        <span className={cn(row.isStale && "text-[hsl(var(--warn))]")}>
          {relativeTime(row.updatedAt, now)}
        </span>
        <div className="mt-1 text-xs text-muted-foreground">
          {plural(row.changedFiles, "file")}
        </div>
      </TD>
    </TR>
    {expanded ? <QueueRowDetail row={row} /> : null}
    </>
  );
}

/**
 * The checks cell.
 *
 * Four states and a null, and the null is the one that matters: nobody has
 * read a rollup for this head. Rendering that as "no checks" would turn a fact
 * about Komodo into a claim about the repository, and rendering it as anything
 * green would be worse. So it says nothing at all.
 *
 * The second line carries the age, not a count. Counts only exist for a commit
 * whose individual checks somebody paid to look up, and a queue that printed
 * "0 passed" for the rest would be inventing numbers — while "how long ago was
 * this true" is a question every row can answer and every reader needs.
 */
function ChecksCell({ row }: { row: QueueRow }) {
  const now = useNow();
  const checks = row.checks;
  if (!checks) {
    return (
      <span className="text-xs text-muted-foreground" title="No check rollup has been read for this commit">
        —
      </span>
    );
  }

  return (
    <>
      <StatusPill
        tone={
          checks.state === "passing"
            ? "success"
            : checks.state === "failing"
              ? "error"
              : checks.state === "pending"
                ? "warn"
                : "default"
        }
      >
        {CHECKS_LABEL[checks.state]}
      </StatusPill>
      <div className="mt-1 text-xs text-muted-foreground">
        {checks.failing.length > 0
          ? `${plural(checks.failing.length, "check")} failing`
          : relativeTime(checks.observedAt, now)}
      </div>
    </>
  );
}

/**
 * What is behind the row.
 *
 * The queue's columns answer "which one do I pick up". This answers the next
 * question — "what is actually wrong with it" — without making somebody open
 * GitHub in another tab to find out which check went red.
 */
function QueueRowDetail({ row }: { row: QueueRow }) {
  const now = useNow();

  return (
    <TR>
      <TD colSpan={7} id={`queue-detail-${row.id}`} className="bg-muted-accent/30 py-3">
        <div className="flex flex-wrap gap-x-10 gap-y-4 pl-6 text-xs">
          <section>
            <h3 className="label-mono mb-1.5 text-[10px] text-muted-foreground">
              Checks
            </h3>
            {!row.checks ? (
              <p className="text-muted-foreground">
                No check rollup has been read for {row.headSha.slice(0, 7)} yet.
              </p>
            ) : row.checks.failing.length > 0 ? (
              <ul className="space-y-0.5">
                {row.checks.failing.map((name) => (
                  <li key={name} className="flex items-center gap-1.5">
                    <XCircle className="h-3 w-3 shrink-0 text-[hsl(var(--error))]" />
                    <span>{name}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">
                {/* "this commit", not "this repository": the rollup describes
                    one commit, and a commit can have no checks because the
                    workflows have not dispatched yet or its paths filters
                    excluded it. */}
                {row.checks.state === "neutral"
                  ? `Nothing ran against ${row.headSha.slice(0, 7)}.`
                  : row.checks.state === "failing"
                    ? "Failing. The names of the failing checks have not been read."
                    : `${CHECKS_LABEL[row.checks.state]}${
                        row.checks.total === null ? "" : ` · ${row.checks.total} checks`
                      }`}{" "}
                · read {relativeTime(row.checks.observedAt, now)}
              </p>
            )}
          </section>

          <section>
            <h3 className="label-mono mb-1.5 text-[10px] text-muted-foreground">
              Verification
            </h3>
            <p className="text-muted-foreground">
              {row.verificationSummary?.required
                ? `${row.verificationSummary.requiredVerified} of ${row.verificationSummary.required} required checks verified.`
                : VERIFICATION_LABEL[row.verificationState]}
            </p>
          </section>

          <section>
            <h3 className="label-mono mb-1.5 text-[10px] text-muted-foreground">
              Reviewers
            </h3>
            <p className="text-muted-foreground">
              {row.humanApprovals.length > 0
                ? `Approved by ${row.humanApprovals.join(", ")}.`
                : row.requestedReviewers.length > 0
                  ? `Asked: ${row.requestedReviewers.join(", ")}.`
                  : "Nobody has been asked yet."}
            </p>
          </section>

          {row.easyWin ? (
            <section>
              <h3 className="label-mono mb-1.5 text-[10px] text-muted-foreground">
                Why this is a quick one
              </h3>
              <p className="text-muted-foreground">
                {row.easyWin.signals.length > 0
                  ? row.easyWin.signals.map((s) => SIGNAL_LABEL[s]).join(" · ")
                  : "Nothing is blocking it."}
              </p>
            </section>
          ) : null}
        </div>
      </TD>
    </TR>
  );
}
