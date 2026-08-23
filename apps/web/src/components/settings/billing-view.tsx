"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, SectionHeading } from "@/components/ui/card";
import { Select } from "@/components/ui/controls";
import { Badge } from "@/components/ui/display";
import { DataTable, EmptyRow, TH, THead } from "@/components/ui/table";
import { fullName, useOrganization, useRepositories } from "@/lib/data/queries";
import { shortDate } from "@/lib/utils";

export function BillingView() {
  const org = useOrganization();
  const repos = useRepositories();
  const [ossRepo, setOssRepo] = React.useState("");

  return (
    <div className="space-y-8 pb-12">
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <SectionHeading title="Payment Methods" />
          <Button>
            <Plus className="h-3.5 w-3.5" />
            Add Payment Method
          </Button>
        </div>
        <DataTable>
          <THead>
            <tr>
              <TH>Method</TH>
              <TH className="w-[580px]">Expiry</TH>
              <TH className="w-[40px]" />
            </tr>
          </THead>
          <tbody>
            <EmptyRow colSpan={3}>No payment methods</EmptyRow>
          </tbody>
        </DataTable>
      </section>

      <section className="space-y-4">
        <SectionHeading title="Billing Portal" />
        <Card className="p-5">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-base font-medium">
                Manage Billing <Badge tone="muted">Trial</Badge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                You&apos;re on a free trial until {shortDate(org.trialEndsAt)}.
                Visit the portal to add a payment method or manage your plan.
              </p>
              <button
                type="button"
                className="mt-3 text-sm underline underline-offset-4 hover:text-foreground"
              >
                Cancel subscription
              </button>
            </div>
            <Button variant="secondary">Manage</Button>
          </div>
        </Card>
      </section>

      <section className="space-y-4">
        <SectionHeading
          title="Komodo for Open Source"
          subtitle="Free code reviews for public open-source repositories on github.com and gitlab.com"
        />
        <Card className="p-5">
          <Select
            size="md"
            align="start"
            className="w-[410px]"
            panelClassName="max-h-[280px] overflow-y-auto"
            value={ossRepo}
            onChange={setOssRepo}
            placeholder="Select a repository"
            options={repos.map((r) => ({ value: r.id, label: fullName(r) }))}
          />
        </Card>
      </section>
    </div>
  );
}
