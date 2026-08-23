"use client";

import Link from "next/link";
import { SettingRow } from "@/components/ui/card";
import { Toggle } from "@/components/ui/controls";
import { PageTitle } from "@/components/settings/page-title";
import { useOrganization, useOrgSettings } from "@/lib/data/queries";
import { useUpdateOrgSettings } from "@/lib/data/mutations";

/** SPEC §8.2 */
export function RepoSettingsView() {
  const org = useOrganization();
  const settings = useOrgSettings();
  const update = useUpdateOrgSettings();

  return (
    <div className="space-y-4">
      <PageTitle>Repo Settings</PageTitle>
      <SettingRow
        title="Auto-enable new repos"
        description={`Automatically enable Greptile review when new repos are added to ${org.name}`}
        control={
          <Toggle
            checked={settings.autoEnableNewRepos}
            onChange={(autoEnableNewRepos) => update({ autoEnableNewRepos })}
            label="Auto-enable new repos"
          />
        }
      />
      <p className="text-sm text-muted-foreground">
        Have an open source repo?{" "}
        <Link
          href={`/${org.slug}/-/settings/billing`}
          className="underline underline-offset-4 hover:text-foreground"
        >
          Get free code reviews in Billing
        </Link>
        .
      </p>
    </div>
  );
}
