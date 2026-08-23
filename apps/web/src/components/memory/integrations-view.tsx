"use client";

import * as React from "react";
import { Puzzle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge, EmptyState, StatusPill } from "@/components/ui/display";
import { Popover, PopoverItem } from "@/components/ui/controls";
import { DataTable, TD, TH, THead, TR } from "@/components/ui/table";
import { useIntegrations } from "@/lib/data/queries";
import {
  useConnectIntegration,
  useDisconnectIntegration,
} from "@/lib/data/mutations";
import type { IntegrationProvider } from "@/lib/types";

const PROVIDERS: {
  value: IntegrationProvider;
  label: string;
  beta?: boolean;
  color: string;
}[] = [
  { value: "atlassian", label: "Atlassian", beta: true, color: "#2684FF" },
  { value: "linear", label: "Linear", beta: true, color: "#E6E6E6" },
  { value: "devin", label: "Devin", color: "#5B8CFF" },
];

/** SPEC §7.4 */
export function IntegrationsView() {
  const integrations = useIntegrations();
  const connect = useConnectIntegration();
  const disconnect = useDisconnectIntegration();
  const [menuOpen, setMenuOpen] = React.useState(false);

  const addButton = (
    <Popover
      open={menuOpen}
      onOpenChange={setMenuOpen}
      panelClassName="w-[152px]"
      trigger={({ toggle }) => (
        <Button variant="brand" onClick={toggle}>
          <span className="text-base leading-none">+</span>
          Add new data source
        </Button>
      )}
    >
      <div className="py-1">
        {PROVIDERS.map((provider) => (
          <PopoverItem
            key={provider.value}
            onClick={() => {
              connect(provider.value);
              setMenuOpen(false);
            }}
          >
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-3.5 w-3.5 rounded-[2px]"
                style={{ background: provider.color }}
              />
              {provider.label}
            </span>
            {provider.beta ? <Badge>Beta</Badge> : null}
          </PopoverItem>
        ))}
      </div>
    </Popover>
  );

  return (
    <div className="min-w-0 flex-1 overflow-y-auto px-6 py-6">
      <DataTable>
        <THead>
          <tr>
            <TH>Providers</TH>
            <TH className="w-[410px]">Status</TH>
            <TH className="w-[350px]">Actions</TH>
          </tr>
        </THead>
        <tbody>
          {integrations.length === 0 ? (
            <tr>
              <td colSpan={3}>
                <EmptyState
                  icon={<Puzzle className="h-6 w-6" />}
                  title="No integrations connected"
                  description="Connect a data source to enrich Greptile reviews with additional context."
                  action={addButton}
                />
              </td>
            </tr>
          ) : (
            integrations.map((integration) => {
              const provider = PROVIDERS.find(
                (p) => p.value === integration.provider,
              );
              return (
                <TR key={integration.id}>
                  <TD>
                    <span className="flex items-center gap-2.5">
                      <span
                        aria-hidden
                        className="h-4 w-4 rounded-[2px]"
                        style={{ background: provider?.color }}
                      />
                      {provider?.label}
                      {provider?.beta ? <Badge>Beta</Badge> : null}
                    </span>
                  </TD>
                  <TD>
                    <StatusPill tone="success">connected</StatusPill>
                  </TD>
                  <TD>
                    <Button
                      size="sm"
                      onClick={() => disconnect(integration.id)}
                    >
                      Disconnect
                    </Button>
                  </TD>
                </TR>
              );
            })
          )}
        </tbody>
      </DataTable>

      {integrations.length > 0 ? (
        <div className="mt-4">{addButton}</div>
      ) : null}
    </div>
  );
}
