"use client";

import { AlertCircle, Settings as SettingsIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, SectionHeading, SettingRow } from "@/components/ui/card";
import { Toggle } from "@/components/ui/controls";
import { Input } from "@/components/ui/input";
import { DataTable, TD, TH, THead, TR } from "@/components/ui/table";
import { Field } from "@/components/memory/add-context-modal";
import { useOrganization, usePersonalSettings } from "@/lib/data/queries";
import { useUpdatePersonalSettings } from "@/lib/data/mutations";

/** SPEC §9.1 */
export function AccountView() {
  const org = useOrganization();
  const personal = usePersonalSettings();
  const update = useUpdatePersonalSettings();

  return (
    <div className="space-y-8 pb-12">
      <section className="space-y-4">
        <SectionHeading title="Profile" />
        <Card className="space-y-4 p-5">
          <Field label="Name">
            <Input
              value={personal.name}
              onChange={(event) => update({ name: event.target.value })}
              className="max-w-[440px]"
            />
          </Field>
          <Field label="Email">
            <Input
              value={personal.email}
              disabled
              className="max-w-[440px] bg-secondary"
            />
          </Field>
        </Card>
      </section>

      <section className="space-y-4">
        <SectionHeading title="Roles & Access" />
        <DataTable>
          <THead>
            <tr>
              <TH>Name</TH>
              <TH className="w-[128px]">Role</TH>
              <TH className="w-[96px]">Actions</TH>
            </tr>
          </THead>
          <tbody>
            <TR>
              <TD>{org.name}</TD>
              <TD className="capitalize">{org.role}</TD>
              <TD>
                <button
                  type="button"
                  aria-label="Organization settings"
                  className="flex h-8 w-8 items-center justify-center rounded-[2px] border border-border text-muted-foreground transition-colors hover:bg-muted-accent hover:text-foreground"
                >
                  <SettingsIcon className="h-4 w-4" />
                </button>
              </TD>
            </TR>
          </tbody>
        </DataTable>
      </section>

      <section className="space-y-4">
        <SectionHeading title="Email Preferences" />
        <SettingRow
          title="Weekly Digest"
          description="Receive a weekly summary about your team's activity and Greptile's catches"
          control={
            <Toggle
              checked={personal.weeklyDigest}
              onChange={(weeklyDigest) => update({ weeklyDigest })}
              label="Weekly Digest"
            />
          }
        />
      </section>

      <section className="space-y-4">
        <SectionHeading title="Danger Zone" />
        <Card className="border-[hsl(var(--destructive)/0.5)] p-5">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-base font-medium text-[hsl(var(--destructive))]">
                <AlertCircle className="h-4 w-4" />
                Delete this account
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                You must leave or delete all organizations before deleting your
                account.
              </div>
            </div>
            <Button variant="destructive" disabled>
              Delete Account
            </Button>
          </div>
        </Card>
      </section>
    </div>
  );
}
