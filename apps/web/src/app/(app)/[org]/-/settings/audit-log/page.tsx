import { Button } from "@/components/ui/button";
import { SettingRow } from "@/components/ui/card";
import { Badge } from "@/components/ui/display";
import { PageTitle } from "@/components/settings/page-title";

/** SPEC §8.12 */
export default function AuditLogPage() {
  return (
    <div className="space-y-4">
      <PageTitle badge={<Badge>Beta</Badge>}>Audit Log</PageTitle>
      <SettingRow
        title={
          <span className="flex items-center gap-2">
            Audit Logs <Badge>Enterprise</Badge>
          </span>
        }
        description="Audit Logs are available on the Greptile Enterprise plan."
        control={<Button variant="brand">Talk to Sales</Button>}
      />
    </div>
  );
}
