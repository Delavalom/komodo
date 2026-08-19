"use client";

import * as React from "react";
import { AlertCircle, SquarePen, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, SectionHeading, SettingRow } from "@/components/ui/card";
import { Toggle } from "@/components/ui/controls";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/display";
import { useOrgSettings, useOrganization } from "@/lib/data/queries";
import { useUpdateOrgSettings } from "@/lib/data/mutations";

/** SPEC §8.7 */
export function OrganizationView() {
  const org = useOrganization();
  const settings = useOrgSettings();
  const update = useUpdateOrgSettings();
  const [editing, setEditing] = React.useState(false);

  return (
    <div className="space-y-8 pb-12">
      <section className="space-y-4">
        <SectionHeading title="Organization Details" />
        <Card className="p-5">
          <div className="flex items-center justify-between gap-6">
            <div className="flex flex-1 items-center gap-6">
              <span className="text-sm font-medium">Name</span>
              <Input
                value={settings.orgDisplayName}
                disabled={!editing}
                onChange={(event) =>
                  update({ orgDisplayName: event.target.value })
                }
                className="max-w-[360px] bg-secondary"
              />
            </div>
            <Button variant="secondary" onClick={() => setEditing((v) => !v)}>
              <SquarePen className="h-3.5 w-3.5" />
              {editing ? "Done" : "Edit"}
            </Button>
          </div>
        </Card>
      </section>

      <section className="space-y-4">
        <SectionHeading title="Enterprise SSO" />
        <SettingRow
          title={
            <span className="flex items-center gap-2">
              Enterprise SSO <Badge>Enterprise</Badge>
            </span>
          }
          description="Enterprise SSO is available on the Greptile Enterprise plan."
          control={<Button variant="brand">Talk to Sales</Button>}
        />
      </section>

      <section className="space-y-4">
        <SectionHeading title="Data & Privacy" />
        <SettingRow
          title="Help us improve Greptile"
          description="Allow Greptile to learn from your usage to improve the code review agent"
          control={
            <Toggle
              checked={settings.helpImproveGreptile}
              onChange={(helpImproveGreptile) => update({ helpImproveGreptile })}
              label="Help us improve Greptile"
            />
          }
        />
      </section>

      <section className="space-y-4">
        <SectionHeading title="Feature Tips" />
        <SettingRow
          title="New feature tips in PR comments"
          description="Occasional tips about Greptile features included in review comments"
          control={
            <Toggle
              checked={settings.featureTips}
              onChange={(featureTips) => update({ featureTips })}
              label="New feature tips in PR comments"
            />
          }
        />
      </section>

      <section className="space-y-4">
        <SectionHeading title="Danger Zone" />
        <SettingRow
          title="Change organization handle"
          description={`Your handle is used in URLs. Changing it will require all members to update their bookmarks.`}
          control={<Button variant="secondary">Change Handle</Button>}
        />
        <Card className="border-[hsl(var(--destructive)/0.5)] p-5">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-base font-medium text-[hsl(var(--destructive))]">
                <AlertCircle className="h-4 w-4" />
                Delete this Organization
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                This will permanently delete the organization and all its data
                for every member. This cannot be undone.
              </div>
            </div>
            <Button variant="destructive" disabled>
              <Trash2 className="h-3.5 w-3.5" />
              Delete Organization
            </Button>
          </div>
        </Card>
      </section>

      <p className="sr-only">{org.slug}</p>
    </div>
  );
}
