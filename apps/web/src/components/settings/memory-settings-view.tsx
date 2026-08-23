"use client";

import { SectionHeading, SettingRow } from "@/components/ui/card";
import { Toggle } from "@/components/ui/controls";
import { useOrgSettings } from "@/lib/data/queries";
import { useUpdateOrgSettings } from "@/lib/data/mutations";

/**
 * The one switch that governs custom context.
 *
 * It used to ask who was allowed to create a memory rule, which is a question
 * a deployment with no accounts cannot answer — and the answer went to
 * localStorage, where nothing read it. What a team actually needs here is a
 * way to stop applying the rules without deleting them: a rule that skews
 * every review is easier to switch off than to find.
 */
export function MemorySettingsView() {
  const settings = useOrgSettings();
  const update = useUpdateOrgSettings();

  return (
    <div className="space-y-4">
      <SectionHeading
        title="Memory"
        subtitle="Control whether the rules you have taught Komodo reach the reviewer"
      />
      <SettingRow
        title="Apply custom context to reviews"
        description={
          settings.memoryEnabled
            ? "Rules matching the changed files are handed to the reviewer with the diff."
            : "Rules are kept but ignored. Reviews run on the diff and the repository alone."
        }
        control={
          <Toggle
            checked={settings.memoryEnabled}
            onChange={(memoryEnabled) => update({ memoryEnabled })}
            label="Apply custom context to reviews"
          />
        }
      />
    </div>
  );
}
