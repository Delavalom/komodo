"use client";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/card";
import { GithubIcon, StatusPill } from "@/components/ui/display";
import { DataTable, TD, TH, THead, TR } from "@/components/ui/table";
import { usePersonalSettings } from "@/lib/data/queries";
import { useUpdatePersonalSettings } from "@/lib/data/mutations";

/** SPEC §9.3 */
export function ConnectionsView() {
  const personal = usePersonalSettings();
  const update = useUpdatePersonalSettings();
  const configured = personal.cursorCloudAgents === "connected";

  return (
    <div className="space-y-8 pb-12">
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <SectionHeading title="Linked Accounts" />
          <Button>
            <Plus className="h-3.5 w-3.5" />
            Add Account
          </Button>
        </div>
        <DataTable>
          <THead>
            <tr>
              <TH>Provider</TH>
              <TH className="w-[580px]">Actions</TH>
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
              <TD>
                <Button
                  size="sm"
                  onClick={() => update({ githubLinked: !personal.githubLinked })}
                >
                  {personal.githubLinked ? "Unlink" : "Link"}
                </Button>
              </TD>
            </TR>
          </tbody>
        </DataTable>
      </section>

      <section className="space-y-4">
        <SectionHeading title="Personal Integrations" />
        <DataTable>
          <THead>
            <tr>
              <TH>Integration</TH>
              <TH className="w-[176px]">Status</TH>
              <TH className="w-[142px]">Actions</TH>
            </tr>
          </THead>
          <tbody>
            <TR>
              <TD>Cursor Cloud Agents</TD>
              <TD>
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="h-2 w-2 rounded-full"
                    style={{
                      background: configured
                        ? "hsl(var(--success))"
                        : "hsl(var(--warn))",
                    }}
                  />
                  <StatusPill tone={configured ? "success" : "default"}>
                    {configured ? "Connected" : "Not configured"}
                  </StatusPill>
                </span>
              </TD>
              <TD>
                <Button
                  size="sm"
                  onClick={() =>
                    update({
                      cursorCloudAgents: configured
                        ? "not_configured"
                        : "connected",
                    })
                  }
                >
                  {configured ? "Disconnect" : "Configure"}
                </Button>
              </TD>
            </TR>
          </tbody>
        </DataTable>
      </section>
    </div>
  );
}
