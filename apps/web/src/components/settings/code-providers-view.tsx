"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge, GithubIcon } from "@/components/ui/display";
import { PageTitle } from "@/components/settings/page-title";
import { useNow } from "@/lib/data/provider";
import { useRescanRepositories } from "@/lib/data/mutations";
import { plural, relativeTime } from "@/lib/utils";
import type { DeploymentStatus } from "@/lib/data/deployment";

/**
 * Where the code comes from, and whether it is still arriving.
 *
 * Every figure here is read off the deployment: the account is whoever GitHub
 * says the token belongs to, the sync times are the heartbeats the ingester
 * writes as it finishes a pass, and the organisations are the owners this
 * store actually holds repositories for. The screen this replaced stated all
 * four from memory — including a "Last Sync: ~6 hours ago" that was six hours
 * ago on exactly one afternoon in August.
 *
 * There is no Add Provider button any more. Komodo talks to GitHub with one
 * token, which comes from the environment or `gh`; a button here could only
 * have opened a dialog that wrote nothing.
 */
export function CodeProvidersView({ status }: { status: DeploymentStatus }) {
  const now = useNow();
  const rescan = useRescanRepositories();
  const [pending, setPending] = React.useState(false);
  const [queued, setQueued] = React.useState(false);

  const { github } = status;

  async function onRescan() {
    setPending(true);
    try {
      await rescan();
      setQueued(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageTitle>Code Providers</PageTitle>

      <Card>
        <div className="flex flex-wrap items-center gap-6 p-4">
          <span className="flex items-center gap-2.5">
            <GithubIcon className="h-6 w-6" />
            <span className="text-[15px]">GitHub</span>
          </span>

          <div className="text-sm">
            <div className="text-muted-foreground">Account</div>
            <div className="font-mono text-[13px]">
              {github.connected ? github.login : "not connected"}
            </div>
          </div>

          <div className="text-sm">
            <div className="text-muted-foreground">Credential</div>
            <div>{github.source ?? "none found"}</div>
          </div>

          <div className="text-sm">
            <div className="text-muted-foreground">Last poll</div>
            <div>
              {status.lastPollAt === null
                ? "not yet — the poller has not finished a pass"
                : relativeTime(status.lastPollAt, now)}
            </div>
          </div>

          <div className="text-sm">
            <div className="text-muted-foreground">Last repo scan</div>
            <div>
              {status.lastDiscoveryAt === null
                ? "never"
                : relativeTime(status.lastDiscoveryAt, now)}
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" onClick={onRescan} disabled={pending}>
              <RefreshCw className="h-3.5 w-3.5" />
              {pending ? "Queueing…" : "Rescan repositories"}
            </Button>
            {github.login ? (
              <a
                href={`https://github.com/${github.login}`}
                target="_blank"
                rel="noreferrer"
                aria-label="Open this account on GitHub"
                className="flex h-8 w-8 items-center justify-center rounded-[2px] text-muted-foreground transition-colors hover:bg-muted-accent hover:text-foreground"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            ) : null}
          </div>
        </div>

        {queued ? (
          <p className="border-t border-border px-4 py-2.5 text-sm text-muted-foreground">
            Queued. The next poll re-reads each owner&apos;s repository list;
            new ones appear under Manage Repositories.
          </p>
        ) : null}

        {github.error ? (
          <p className="flex items-start gap-2 border-t border-border bg-secondary px-4 py-2.5 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--destructive))]" />
            <span>{github.error}</span>
          </p>
        ) : null}

        {status.lastPollError ? (
          <p className="flex items-start gap-2 border-t border-border bg-secondary px-4 py-2.5 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--destructive))]" />
            <span>
              The last poll failed: {status.lastPollError}
            </span>
          </p>
        ) : null}

        <div className="border-t border-border px-4 py-2.5 text-sm text-muted-foreground">
          {plural(status.owners.length, "organization")}
        </div>

        {status.owners.map((owner) => (
          <div
            key={owner.owner}
            className="flex items-center justify-between border-t border-border px-4 py-3 text-sm"
          >
            <span className="flex items-center gap-2.5">
              <GithubIcon className="h-4 w-4" />
              {owner.owner}
            </span>
            <span className="flex items-center gap-3 text-muted-foreground">
              <span>
                {owner.enabled} of {plural(owner.repos, "repository", "repositories")}{" "}
                being polled
              </span>
              {owner.enabled > 0 ? (
                <Badge tone="muted" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" /> active
                </Badge>
              ) : null}
            </span>
          </div>
        ))}
      </Card>
    </div>
  );
}
