"use client";

import Link from "next/link";
import { SettingRow } from "@/components/ui/card";
import { IS_CLOUD } from "@/lib/flags";
import { Toggle } from "@/components/ui/controls";
import { PageTitle } from "@/components/settings/page-title";
import { useOrganization, useOrgSettings } from "@/lib/data/queries";
import { useUpdateOrgSettings } from "@/lib/data/mutations";

export function RepoSettingsView() {
  const org = useOrganization();
  const settings = useOrgSettings();
  const update = useUpdateOrgSettings();

  return (
    <div className="space-y-4">
      <PageTitle>Repo Settings</PageTitle>
      <SettingRow
        title="Auto-enable new repos"
        description={`Keep looking for repositories under the owners ${org.name} already watches, and poll each new one as it appears`}
        control={
          <Toggle
            checked={settings.autoEnableNewRepos}
            onChange={(autoEnableNewRepos) => update({ autoEnableNewRepos })}
            label="Auto-enable new repos"
          />
        }
      />
      {IS_CLOUD ? (
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
      ) : (
        <p className="text-sm text-muted-foreground">
          Repositories are discovered from the owners this deployment already
          watches, and listed under{" "}
          <Link
            href={`/${org.slug}/-/settings/manage-repos`}
            className="underline underline-offset-4 hover:text-foreground"
          >
            Manage Repositories
          </Link>
          . With this on, each new repository is found and polled on its own.
          With it off, nothing is listed until someone presses Rescan
          repositories on Code Providers — an owner with hundreds of them is not
          worth a listing every minute.
        </p>
      )}
    </div>
  );
}
