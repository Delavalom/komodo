"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { GithubIcon, Modal } from "@/components/ui/display";
import { Checkbox } from "@/components/ui/controls";
import { Field } from "@/components/memory/add-context-modal";
import {
  fullName,
  useRepoClusters,
  useRepoIndex,
  useRepositories,
} from "@/lib/data/queries";
import { useCreateRepoCluster, useDeleteRepoCluster } from "@/lib/data/mutations";
import { plural } from "@/lib/utils";

/** SPEC §7.2 */
export function RepoClustersView() {
  const clusters = useRepoClusters();
  const repoIndex = useRepoIndex();
  const [open, setOpen] = React.useState(false);

  return (
    <div className="min-w-0 flex-1 overflow-y-auto px-6 py-6">
      {clusters.length === 0 ? (
        <Card className="flex h-[108px] items-center justify-center">
          <Button variant="brand" onClick={() => setOpen(true)}>
            <span className="text-base leading-none">+</span>
            Create Repo Cluster
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {clusters.map((cluster) => (
            <ClusterCard
              key={cluster.id}
              id={cluster.id}
              name={cluster.name}
              members={cluster.memberRepoIds
                .map((id) => repoIndex.get(id))
                .filter(Boolean)
                .map((r) => fullName(r!))}
            />
          ))}
          <Button variant="brand" onClick={() => setOpen(true)}>
            <span className="text-base leading-none">+</span>
            Create Repo Cluster
          </Button>
        </div>
      )}

      <NewClusterModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function ClusterCard({
  id,
  name,
  members,
}: {
  id: string;
  name: string;
  members: string[];
}) {
  const remove = useDeleteRepoCluster();
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-base font-medium">{name}</div>
          <div className="mt-1 text-sm text-muted-foreground">
            {plural(members.length, "repository", "repositories")}
          </div>
          <ul className="mt-3 space-y-1.5">
            {members.map((member) => (
              <li key={member} className="flex items-center gap-2 text-sm">
                <GithubIcon className="h-4 w-4" />
                {member}
              </li>
            ))}
          </ul>
        </div>
        <Button
          variant="ghost"
          aria-label="Delete cluster"
          onClick={() => remove(id)}
          className="h-8 w-8 p-0 text-[hsl(var(--destructive))]"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}

function NewClusterModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const repos = useRepositories();
  const create = useCreateRepoCluster();
  const [name, setName] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [members, setMembers] = React.useState<string[]>([]);

  const visible = repos.filter((r) =>
    fullName(r).toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={548}
      title="New repo cluster"
      footer={
        <div className="flex justify-end">
          <Button
            variant="secondary"
            disabled={!name.trim() || members.length === 0}
            onClick={() => {
              create(name.trim(), members);
              setName("");
              setMembers([]);
              setQuery("");
              onClose();
            }}
          >
            Create cluster
          </Button>
        </div>
      }
    >
      <div className="space-y-5 p-5">
        <Field label="Name">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={'Example: "iOS app and dependencies"'}
          />
        </Field>
        <Field label="Members">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search repositories to add"
            className="bg-secondary"
          />
        </Field>
        <div className="max-h-[220px] overflow-y-auto rounded-[2px] border border-border">
          {visible.map((repo) => {
            const checked = members.includes(repo.id);
            return (
              <button
                key={repo.id}
                type="button"
                onClick={() =>
                  setMembers((prev) =>
                    checked
                      ? prev.filter((id) => id !== repo.id)
                      : [...prev, repo.id],
                  )
                }
                className="flex w-full items-center gap-2.5 border-b border-border px-3 py-2 text-left text-sm transition-colors last:border-b-0 hover:bg-muted-accent"
              >
                <Checkbox checked={checked} onChange={() => {}} />
                <GithubIcon className="h-4 w-4" />
                {fullName(repo)}
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
