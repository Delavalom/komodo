"use client";

import Link from "next/link";
import { AlertCircle, Settings as SettingsIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, SectionHeading } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DataTable, TD, TH, THead, TR } from "@/components/ui/table";
import { Field } from "@/components/memory/add-context-modal";
import { useOrganization, usePersonalSettings } from "@/lib/data/queries";

export function AccountView() {
  const org = useOrganization();
  const personal = usePersonalSettings();

  return (
    <div className="space-y-8 pb-12">
      <section className="space-y-4">
        <SectionHeading title="Profile" />
        <Card className="space-y-4 p-5">
          {/* Both read-only: identity comes from the roster in komodo.yaml,
              not from a per-browser preference. Editing it here would change
              the name on one screen and match nothing the reviewer sees. */}
          <Field label="Name">
            <Input
              value={personal.name}
              disabled
              className="max-w-[440px] bg-secondary"
            />
          </Field>
          <Field label="Email">
            <Input
              value={personal.email}
              disabled
              className="max-w-[440px] bg-secondary"
            />
          </Field>
          <p className="text-sm text-muted-foreground">
            Signed in as{" "}
            <code className="font-mono text-xs">
              {personal.githubLogin || "unknown"}
            </code>
            . Set by <code className="font-mono text-xs">team.you</code> in
            komodo.yaml, and the key that matches you to your pull requests.
          </p>
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
                <Link
                  href={`/${org.slug}/-/settings/organization`}
                  aria-label="Organization settings"
                  className="flex h-8 w-8 items-center justify-center rounded-[2px] border border-border text-muted-foreground transition-colors hover:bg-muted-accent hover:text-foreground"
                >
                  <SettingsIcon className="h-4 w-4" />
                </Link>
              </TD>
            </TR>
          </tbody>
        </DataTable>
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
