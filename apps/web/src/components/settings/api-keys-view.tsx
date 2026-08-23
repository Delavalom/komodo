"use client";

import * as React from "react";
import { KeyRound, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState, Modal } from "@/components/ui/display";
import { Input, SearchInput } from "@/components/ui/input";
import { DataTable, TD, TH, THead, TR } from "@/components/ui/table";
import { PageTitle } from "@/components/settings/page-title";
import { Field } from "@/components/memory/add-context-modal";
import { useApiKeys } from "@/lib/data/queries";
import { useCreateApiKey, useDeleteApiKey } from "@/lib/data/mutations";
import { absoluteStamp } from "@/lib/utils";

/**
 * Keys for the HTTP API under /api/v1.
 *
 * The secret is shown once, here, and then never again — the server keeps
 * only a SHA-256 of it. That is a real constraint on this screen rather than a
 * decoration: there is no "reveal" button because there is nothing to reveal,
 * and a lost key is replaced rather than recovered.
 */
export function ApiKeysView() {
  const [search, setSearch] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [pending, setPending] = React.useState(false);
  // The plaintext, held only until this screen is dismissed.
  const [minted, setMinted] = React.useState<string | null>(null);
  const keys = useApiKeys(search);
  const create = useCreateApiKey();
  const remove = useDeleteApiKey();

  const submit = async () => {
    if (pending || !name.trim()) return;
    setPending(true);
    try {
      const { secret } = await create(name.trim());
      setName("");
      setOpen(false);
      setMinted(secret);
    } finally {
      setPending(false);
    }
  };

  const createButton = (
    <Button variant="brand" onClick={() => setOpen(true)}>
      Create API Key
    </Button>
  );

  return (
    <div className="space-y-4">
      <PageTitle>API Keys</PageTitle>
      <div className="flex items-center gap-3">
        <SearchInput
          wrapperClassName="flex-1"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name..."
        />
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          Create API Key
        </Button>
      </div>

      <DataTable>
        <THead>
          <tr>
            <TH sortable sorted={null} onSort={() => {}}>
              Name
            </TH>
            <TH className="w-[240px]">Key</TH>
            <TH className="w-[180px]">Last used</TH>
            <TH className="w-[364px]" sortable sorted="desc" onSort={() => {}}>
              Created
            </TH>
            <TH className="w-[96px]">Action</TH>
          </tr>
        </THead>
        <tbody>
          {keys.length === 0 ? (
            <tr>
              <td colSpan={5}>
                <EmptyState
                  icon={<KeyRound className="h-6 w-6" />}
                  title="No API keys yet"
                  description="Create an API key to read the queue and trigger reviews from your own tooling."
                  action={createButton}
                />
              </td>
            </tr>
          ) : (
            keys.map((key) => (
              <TR key={key.id}>
                <TD>{key.name}</TD>
                <TD className="font-mono text-xs text-muted-foreground">
                  {key.prefix}…
                </TD>
                <TD className="text-muted-foreground">
                  {key.lastUsedAt ? absoluteStamp(key.lastUsedAt) : "Never"}
                </TD>
                <TD className="text-muted-foreground">
                  {absoluteStamp(key.createdAt)}
                </TD>
                <TD>
                  <Button
                    variant="ghost"
                    aria-label={`Delete ${key.name}`}
                    onClick={() => remove(key.id)}
                    className="h-8 w-8 p-0 text-[hsl(var(--destructive))]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TD>
              </TR>
            ))
          )}
        </tbody>
      </DataTable>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create API Key"
        subtitle="Name it after the service that will use it."
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              disabled={pending || !name.trim()}
              onClick={() => void submit()}
            >
              {pending ? "Creating…" : "Create API Key"}
            </Button>
          </div>
        }
      >
        <div className="p-5">
          <Field label="Name">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. CI pipeline"
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={minted !== null}
        onClose={() => setMinted(null)}
        title="Copy your API key"
        subtitle="This is the only time it is shown. Komodo stores a hash, not the key — if you lose it, create another."
        footer={
          <div className="flex justify-end">
            <Button variant="brand" onClick={() => setMinted(null)}>
              Done
            </Button>
          </div>
        }
      >
        <div className="space-y-4 p-5">
          <pre className="overflow-x-auto rounded-[2px] border border-border bg-secondary p-3 font-mono text-xs">
            {minted}
          </pre>
          <p className="text-sm text-muted-foreground">
            Send it as{" "}
            <code className="font-mono text-xs">
              Authorization: Bearer &lt;key&gt;
            </code>{" "}
            to <code className="font-mono text-xs">/api/v1/queue</code>.
          </p>
        </div>
      </Modal>
    </div>
  );
}
