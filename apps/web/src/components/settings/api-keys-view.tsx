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

/** SPEC §8.11 */
export function ApiKeysView() {
  const [search, setSearch] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const keys = useApiKeys(search);
  const create = useCreateApiKey();
  const remove = useDeleteApiKey();

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
            <TH className="w-[364px]">ID</TH>
            <TH className="w-[364px]" sortable sorted="desc" onSort={() => {}}>
              Created
            </TH>
            <TH className="w-[96px]">Action</TH>
          </tr>
        </THead>
        <tbody>
          {keys.length === 0 ? (
            <tr>
              <td colSpan={4}>
                <EmptyState
                  icon={<KeyRound className="h-6 w-6" />}
                  title="No API keys yet"
                  description="Create an API key to integrate Greptile into your workflow."
                  action={createButton}
                />
              </td>
            </tr>
          ) : (
            keys.map((key) => (
              <TR key={key.id}>
                <TD>{key.name}</TD>
                <TD className="font-mono text-xs text-muted-foreground">
                  {key.keyId}
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
              disabled={!name.trim()}
              onClick={() => {
                create(name.trim());
                setName("");
                setOpen(false);
              }}
            >
              Create API Key
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
    </div>
  );
}
