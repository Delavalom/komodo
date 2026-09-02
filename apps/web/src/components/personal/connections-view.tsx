"use client";

/**
 * Who this deployment thinks you are on GitHub, and how it acts as you.
 *
 * Two different things, and the screen has to keep them apart. The login is
 * set in komodo.yaml and is the key that matches you to your pull requests — a
 * wrong one means the queue silently never shows you anything. The token is
 * yours, optional, and only used for the one thing a shared credential cannot
 * honestly do: submit a review that GitHub records as yours.
 */
import * as React from "react";
import { useRouter } from "next/navigation";

import { GithubIcon } from "@/components/ui/display";
import { SectionHeading } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, TD, TH, THead, TR } from "@/components/ui/table";
import { usePersonalSettings, useGithubIdentity } from "@/lib/data/queries";
import {
  useConnectGithubIdentity,
  useDisconnectGithubIdentity,
} from "@/lib/data/mutations";
import { relativeTime } from "@/lib/utils";
import { useNow } from "@/lib/data/provider";

export function ConnectionsView() {
  const personal = usePersonalSettings();

  return (
    <div className="space-y-8 pb-12">
      <section className="space-y-4">
        <SectionHeading
          title="Linked Accounts"
          subtitle="Set by team.you and team.members in komodo.yaml"
        />
        <DataTable>
          <THead>
            <tr>
              <TH>Provider</TH>
              <TH className="w-[580px]">Account</TH>
            </tr>
          </THead>
          <tbody>
            <TR>
              <TD>
                <span className="flex items-center gap-2.5">
                  <GithubIcon className="h-4 w-4" />
                  GitHub
                </span>
              </TD>
              <TD className="font-mono text-xs text-muted-foreground">
                {personal.githubLogin || "Not set — add yourself to team.members"}
              </TD>
            </TR>
          </tbody>
        </DataTable>
      </section>

      <GithubCredential login={personal.githubLogin} />
    </div>
  );
}

function GithubCredential({ login }: { login: string }) {
  const router = useRouter();
  const now = useNow();
  const identity = useGithubIdentity();
  const connect = useConnectGithubIdentity();
  const disconnect = useDisconnectGithubIdentity();

  const [token, setToken] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const save = async () => {
    if (pending || !token.trim()) return;
    setPending(true);
    setError(null);
    try {
      const result = await connect(token);
      if (result.error) {
        setError(result.error);
        return;
      }
      setToken("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  const remove = async () => {
    setPending(true);
    setError(null);
    try {
      await disconnect();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="space-y-4">
      <SectionHeading
        title="Review as yourself"
        subtitle="A personal GitHub token, so a review you submit from Komodo is recorded by GitHub as yours"
      />

      <div className="border border-border px-4 py-4 text-sm">
        {identity ? (
          <>
            <p>
              Connected as{" "}
              <span className="font-mono text-xs">{identity.login}</span>,{" "}
              {relativeTime(identity.connectedAt, now)}.
            </p>
            {identity.lastError ? (
              <p className="mt-2 text-[hsl(var(--destructive))]">
                The last attempt to use it failed: {identity.lastError}
              </p>
            ) : null}
            <div className="mt-3">
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => void remove()}>
                {pending ? "Removing…" : "Disconnect"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-muted-foreground">
              Without this, Komodo cannot submit a GitHub review as you at all —
              approving with the deployment&rsquo;s shared token would put the
              deployment on GitHub&rsquo;s record instead of the person who
              decided. With it, comments you post from a review go out as you
              too, not only reviews.
            </p>
            <p className="mt-2 text-muted-foreground">
              A fine-grained token with <span className="font-mono text-xs">Pull requests: write</span>{" "}
              on the repositories you review is enough. It will be checked
              against{" "}
              <span className="font-mono text-xs">{login || "your roster login"}</span>{" "}
              before it is saved.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Input
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="github_pat_…"
                className="w-[360px] font-mono text-xs"
                autoComplete="off"
              />
              <Button size="sm" disabled={pending || !token.trim()} onClick={() => void save()}>
                {pending ? "Checking…" : "Connect"}
              </Button>
            </div>
          </>
        )}

        {error ? (
          <p className="mt-3 text-[hsl(var(--destructive))]">{error}</p>
        ) : null}

        {/* Said plainly, because it is true and the consequence is real:
            Komodo has no authentication, so a credential stored here is
            reachable by anybody who can reach this deployment. */}
        <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
          Komodo has no sign-in. Anyone who can open this queue can act as you
          on GitHub once this is connected — keep the deployment on a trusted
          network, scope the token to the repositories you review, and revoke it
          on GitHub if that stops being true.
        </p>
      </div>
    </section>
  );
}
