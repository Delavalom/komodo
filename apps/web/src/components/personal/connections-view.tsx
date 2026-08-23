"use client";

import { GithubIcon } from "@/components/ui/display";
import { SectionHeading } from "@/components/ui/card";
import { DataTable, TD, TH, THead, TR } from "@/components/ui/table";
import { usePersonalSettings } from "@/lib/data/queries";

/**
 * Who this deployment thinks you are on GitHub.
 *
 * There is nothing to link or unlink. Komodo has no per-person login — the
 * deployment holds one GitHub token and komodo.yaml names the roster — so a
 * "Link account" button here would toggle a value nothing reads. What is
 * useful is the opposite: showing the login, because it is the key that
 * matches you to your pull requests, and a wrong one means the queue silently
 * never shows you anything.
 */
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
    </div>
  );
}
