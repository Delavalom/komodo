"use client";

import * as React from "react";
import { Puzzle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState, Modal, StatusPill } from "@/components/ui/display";
import { Popover, PopoverItem } from "@/components/ui/controls";
import { Input } from "@/components/ui/input";
import { DataTable, TD, TH, THead, TR } from "@/components/ui/table";
import { Field } from "@/components/memory/add-context-modal";
import { useIntegrations } from "@/lib/data/queries";
import {
  useConnectIntegration,
  useDisconnectIntegration,
} from "@/lib/data/mutations";
import { absoluteStamp } from "@/lib/utils";
import type { IntegrationProvider } from "@/lib/types";

/**
 * Trackers Komodo can read an issue out of.
 *
 * Connecting one used to write a row to localStorage and mean nothing. It now
 * stores a token the reviewer uses: when a pull request's title names an issue
 * key, the ingester fetches that issue and hands its text to the model with
 * the diff.
 *
 * A pasted token rather than OAuth. A self-hosted deployment has an admin who
 * can create one, and a three-way OAuth dance would be more moving parts than
 * this feature is worth.
 */
const PROVIDERS: {
  value: IntegrationProvider;
  label: string;
  color: string;
  /** Where to get the token, said plainly. */
  hint: string;
  /** Jira needs a site and an account; Linear needs neither. */
  needsSite: boolean;
}[] = [
  {
    value: "linear",
    label: "Linear",
    color: "#5E6AD2",
    hint: "A personal API key from Linear → Settings → Security & access.",
    needsSite: false,
  },
  {
    value: "jira",
    label: "Jira",
    color: "#2684FF",
    hint: "An API token from id.atlassian.com, with the email it belongs to.",
    needsSite: true,
  },
];

export function IntegrationsView() {
  const integrations = useIntegrations();
  const connect = useConnectIntegration();
  const disconnect = useDisconnectIntegration();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [adding, setAdding] = React.useState<IntegrationProvider | null>(null);
  const [token, setToken] = React.useState("");
  const [baseUrl, setBaseUrl] = React.useState("");
  const [account, setAccount] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const spec = PROVIDERS.find((p) => p.value === adding);

  const close = () => {
    setAdding(null);
    setToken("");
    setBaseUrl("");
    setAccount("");
  };

  const submit = async () => {
    if (pending || !adding || !token.trim()) return;
    setPending(true);
    try {
      await connect({
        provider: adding,
        token: token.trim(),
        baseUrl: baseUrl.trim(),
        account: account.trim(),
      });
      close();
    } finally {
      setPending(false);
    }
  };

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
              setAdding(provider.value);
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
                  description="Connect a tracker and Komodo will read the issue a pull request names, so a review can ask whether this is the right change."
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
                      {provider?.label ?? integration.provider}
                    </span>
                  </TD>
                  <TD>
                    {integration.status === "error" ? (
                      <span className="flex flex-col gap-1">
                        <StatusPill tone="error">error</StatusPill>
                        <span className="text-xs text-muted-foreground">
                          {integration.lastError}
                        </span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <StatusPill tone="success">connected</StatusPill>
                        {integration.connectedAt ? (
                          <span className="text-xs text-muted-foreground">
                            since {absoluteStamp(integration.connectedAt)}
                          </span>
                        ) : null}
                      </span>
                    )}
                  </TD>
                  <TD>
                    <Button size="sm" onClick={() => disconnect(integration.id)}>
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

      <Modal
        open={adding !== null}
        onClose={close}
        title={`Connect ${spec?.label ?? ""}`}
        subtitle={spec?.hint}
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button
              variant="brand"
              disabled={
                pending ||
                !token.trim() ||
                (spec?.needsSite ? !baseUrl.trim() || !account.trim() : false)
              }
              onClick={() => void submit()}
            >
              {pending ? "Connecting…" : "Connect"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4 p-5">
          {spec?.needsSite ? (
            <>
              <Field label="Site URL">
                <Input
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  placeholder="https://yourteam.atlassian.net"
                />
              </Field>
              <Field label="Account email">
                <Input
                  value={account}
                  onChange={(event) => setAccount(event.target.value)}
                  placeholder="you@yourteam.com"
                />
              </Field>
            </>
          ) : null}
          <Field label="API token">
            <Input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Paste the token"
            />
          </Field>
          <p className="text-sm text-muted-foreground">
            The token is stored on this deployment and used only to read issues
            a pull request names. It is never shown again after you save it.
          </p>
        </div>
      </Modal>
    </div>
  );
}
