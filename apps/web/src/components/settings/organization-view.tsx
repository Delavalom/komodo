"use client";

import * as React from "react";
import { AlertCircle, SquarePen, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, SectionHeading, SettingRow } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/display";
import { IS_CLOUD } from "@/lib/flags";
import { useOrgSettings, useOrganization } from "@/lib/data/queries";
import { useUpdateOrgSettings } from "@/lib/data/mutations";

/**
 * Who this deployment belongs to.
 *
 * The name is real — it is stored, and the header renders it. Everything else
 * that used to be here was a hosted service's question asked by a self-hosted
 * install: telemetry consent for a product that phones nowhere, feature tips
 * nothing writes, SSO and organization deletion for a deployment that holds
 * exactly one organization and is deleted by stopping the container. Those
 * sit behind IS_CLOUD with billing and seats.
 */
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
                value={settings.orgDisplayName || org.name}
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
        <p className="text-sm text-muted-foreground">
          The handle in your URLs is <code>{org.slug}</code>, set by{" "}
          <code>team.slug</code> in komodo.yaml.
        </p>
      </section>

      {IS_CLOUD ? (
        <>
          <section className="space-y-4">
            <SectionHeading title="Enterprise SSO" />
            <SettingRow
              title={
                <span className="flex items-center gap-2">
                  Enterprise SSO <Badge>Enterprise</Badge>
                </span>
              }
              description="Single sign-on is available on the Komodo Enterprise plan."
              control={<Button variant="brand">Talk to Sales</Button>}
            />
          </section>

          <section className="space-y-4">
            <SectionHeading title="Danger Zone" />
            <Card className="border-[hsl(var(--destructive)/0.5)] p-5">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <div className="flex items-center gap-2 text-base font-medium text-[hsl(var(--destructive))]">
                    <AlertCircle className="h-4 w-4" />
                    Delete this Organization
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    This will permanently delete the organization and all its
                    data for every member. This cannot be undone.
                  </div>
                </div>
                <Button variant="destructive" disabled>
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete Organization
                </Button>
              </div>
            </Card>
          </section>
        </>
      ) : null}
    </div>
  );
}
