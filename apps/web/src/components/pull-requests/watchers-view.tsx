"use client";

/**
 * Which pull requests the poller is watching.
 *
 * A comment's verdict and draft reply live on the pull request itself now —
 * see the Conversation tab, `review/conversation.tsx` — because a reader
 * deciding what to say next wants that next to the comment it answers, not in
 * a second queue they have to cross-reference by title. What this page
 * answers instead is the question that view can't: which pull requests are
 * being watched at all, in what mode, and whether anything on them is still
 * unresolved.
 */
import Link from "next/link";
import { X } from "lucide-react";

import { Avatar, Badge } from "@/components/ui/display";
import { DataTable, EmptyRow, TD, TH, THead, TR } from "@/components/ui/table";
import { useOrganization, useWatchedPullRequests } from "@/lib/data/queries";
import { useUnwatchPullRequest } from "@/lib/data/mutations";
import { useNow } from "@/lib/data/provider";
import { relativeTime } from "@/lib/utils";

export function WatchersView() {
  const now = useNow();
  const org = useOrganization();
  const rows = useWatchedPullRequests();
  const unwatch = useUnwatchPullRequest();

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[1216px] px-5 py-6">
        <div className="flex items-center justify-between pb-4">
          <div>
            <h1 className="text-[17px]">PR Watchers</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Pull requests being checked for new comments every few minutes.
              Verdicts and draft replies show up on each pull request&rsquo;s
              own Conversation tab.
            </p>
          </div>
        </div>

        <DataTable>
          <THead>
            <tr>
              <TH>Pull request</TH>
              <TH className="w-[160px]">Mode</TH>
              <TH className="w-[160px]">Watched by</TH>
              <TH className="w-[140px]">Since</TH>
              <TH className="w-[120px]">Triaged</TH>
              <TH className="w-[72px]">Actions</TH>
            </tr>
          </THead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={6}>
                Nobody is watching a pull request. Watch one from its review
                page to see it listed here.
              </EmptyRow>
            ) : (
              rows.map((row) => (
                <TR key={row.id}>
                  <TD className="py-3">
                    <div className="flex items-start gap-2">
                      <Avatar
                        seed={row.repoFullName}
                        label={row.repoFullName}
                        size={16}
                        className="mt-0.5"
                      />
                      <div className="min-w-0">
                        <Link
                          href={`/${org.slug}/-/pull-requests/${row.repoFullName}/${row.prNumber}?view=conversation`}
                          className="block truncate text-[15px] transition-colors hover:text-[hsl(var(--accent))]"
                        >
                          {row.prTitle}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                          <span>{row.repoFullName}</span>
                          <span>·</span>
                          <span>#{row.prNumber}</span>
                        </div>
                      </div>
                    </div>
                  </TD>
                  <TD className="text-sm text-muted-foreground">
                    {row.mode === "notify_and_draft" ? "Notify + draft" : "Notify only"}
                  </TD>
                  <TD className="text-sm text-muted-foreground">{row.memberName}</TD>
                  <TD title={new Date(row.createdAt).toLocaleString()}>
                    {relativeTime(row.createdAt, now)}
                  </TD>
                  <TD>
                    {row.totalCount === 0 ? (
                      <span className="text-sm text-muted-foreground">Nothing yet</span>
                    ) : row.unresolvedCount > 0 ? (
                      <Badge tone="brand">{row.unresolvedCount} unresolved</Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {row.totalCount} triaged
                      </span>
                    )}
                  </TD>
                  <TD>
                    <button
                      type="button"
                      onClick={() => unwatch(row.id)}
                      title="Stop watching"
                      className="p-1 text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-4" />
                    </button>
                  </TD>
                </TR>
              ))
            )}
          </tbody>
        </DataTable>
      </div>
    </div>
  );
}
