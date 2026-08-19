"use client";

import { SectionHeading, SettingRow } from "@/components/ui/card";
import { Select } from "@/components/ui/controls";
import { useOrgSettings } from "@/lib/data/queries";
import { useUpdateOrgSettings } from "@/lib/data/mutations";

/** SPEC §8.6 */
export function MemorySettingsView() {
  const settings = useOrgSettings();
  const update = useUpdateOrgSettings();

  return (
    <div className="space-y-4">
      <SectionHeading
        title="Memory"
        subtitle="Control how rules learned from pull request conversations are activated"
      />
      <SettingRow
        title="Automatic rule creation via GitHub"
        description={
          settings.memoryRuleCreators === "everyone"
            ? "Everyone can create rules."
            : "Only admins can create rules."
        }
        control={
          <Select
            size="md"
            className="w-[184px]"
            value={settings.memoryRuleCreators}
            onChange={(memoryRuleCreators) => update({ memoryRuleCreators })}
            options={[
              { value: "everyone" as const, label: "Everyone" },
              { value: "admins" as const, label: "Admins only" },
            ]}
          />
        }
      />
    </div>
  );
}
