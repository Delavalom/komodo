"use client";

/**
 * The PR Watchers queue: every comment Komodo has triaged on a watched pull
 * request, newest first. A history a person clears one row at a time — see
 * PullRequestWatchEvent in @komodo/store — not a single mutable "latest"
 * fact, so re-opening this page after a week away still shows what was
 * missed rather than only the most recent thing.
 */
import Link from "next/link";
import { Check, X } from "lucide-react";

import { Avatar } from "@/components/ui/display";
import { DataTable, EmptyRow, TD, TH, THead, TR } from "@/components/ui/table";
import { useOrganization, useWatchEvents } from "@/lib/data/queries";
import { useDismissWatchEvent, useMarkWatchEventSeen } from "@/lib/data/mutations";
import { useNow } from "@/lib/data/provider";
import { cn, relativeTime } from "@/lib/utils";
import type { WatchTriageVerdict } from "@/lib/types";

const VERDICT_LABEL: Record<WatchTriageVerdict, string> = {
  worth_addressing: "Worth addressing",
  not_worth_addressing: "Not worth addressing",
};

export function WatchersView() {
  const now = useNow();
  const org = useOrganization();
  const events = useWatchEvents().filter((e) => e.dismissedAt === null);
  const markSeen = useMarkWatchEventSeen();
  const dismiss = useDismissWatchEvent();

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[1216px] px-5 py-6">
        <div className="flex items-center justify-between pb-4">
          <div>
            <h1 className="text-[17px]">PR Watchers</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              New comments on the pull requests you&rsquo;re watching, and
              whether Claude thinks they&rsquo;re worth a look. Watch a pull
              request from its review page.
            </p>
          </div>
        </div>

        <DataTable>
          <THead>
            <tr>
              <TH>Pull request</TH>
              <TH className="w-[420px]">Comment</TH>
              <TH className="w-[160px]">Verdict</TH>
              <TH className="w-[140px]">When</TH>
              <TH className="w-[96px]">Actions</TH>
            </tr>
          </THead>
          <tbody>
            {events.length === 0 ? (
              <EmptyRow colSpan={5}>
                Nothing triaged yet. Watched pull requests are checked every
                few minutes for new comments.
              </EmptyRow>
            ) : (
              events.map((event) => (
                <TR key={event.id} className={event.seenAt === null ? "bg-muted-accent/20" : undefined}>
                  <TD className="py-3">
                    <div className="flex items-start gap-2">
                      <Avatar
                        seed={event.repoFullName}
                        label={event.repoFullName}
                        size={16}
                        className="mt-0.5"
                      />
                      <div className="min-w-0">
                        <Link
                          href={`/${org.slug}/-/pull-requests/${event.repoFullName}/${event.prNumber}`}
                          className="block truncate text-[15px] transition-colors hover:text-[hsl(var(--accent))]"
                        >
                          {event.prTitle}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                          <span>{event.repoFullName}</span>
                          <span>·</span>
                          <span>#{event.prNumber}</span>
                          <span>·</span>
                          <span>
                            {event.watchMode === "notify_and_draft"
                              ? "Notify + draft"
                              : "Notify only"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <p className="line-clamp-2 text-sm">
                      <span className="text-muted-foreground">{event.commentAuthor}: </span>
                      {event.commentBody}
                    </p>
                    {event.draftResponse ? (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        Draft reply: {event.draftResponse}
                      </p>
                    ) : null}
                  </TD>
                  <TD>
                    <span
                      className={cn(
                        "text-sm",
                        event.verdict === "worth_addressing"
                          ? "text-[hsl(var(--accent))]"
                          : "text-muted-foreground",
                      )}
                      title={event.reasoning}
                    >
                      {VERDICT_LABEL[event.verdict]}
                    </span>
                  </TD>
                  <TD title={new Date(event.createdAt).toLocaleString()}>
                    {relativeTime(event.createdAt, now)}
                  </TD>
                  <TD>
                    <div className="flex items-center gap-1">
                      {event.seenAt === null ? (
                        <button
                          type="button"
                          onClick={() => markSeen(event.id)}
                          title="Mark seen"
                          className="p-1 text-muted-foreground hover:text-foreground"
                        >
                          <Check className="size-4" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => dismiss(event.id)}
                        title="Dismiss"
                        className="p-1 text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
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
