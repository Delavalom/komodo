"use client";

import { SectionHeading, SettingRow } from "@/components/ui/card";
import { Toggle } from "@/components/ui/controls";
import { useOrgSettings } from "@/lib/data/queries";
import { useUpdateOrgSettings } from "@/lib/data/mutations";

/** SPEC §8.5 */
export function TrexSettingsView() {
  const settings = useOrgSettings();
  const update = useUpdateOrgSettings();

  return (
    <div className="space-y-4">
      <SectionHeading
        id="trex"
        title="TREX Settings"
        subtitle="Catch more bugs using code execution"
      />
      <SettingRow
        title="Enable TREX"
        description="This will cost 2 additional credits per review."
        control={
          <Toggle
            checked={settings.trexEnabled}
            onChange={(trexEnabled) => update({ trexEnabled })}
            label="Enable TREX"
          />
        }
      />
    </div>
  );
}
