"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/controls";
import { Input, SearchInput } from "@/components/ui/input";
import { Avatar, Badge, Modal } from "@/components/ui/display";
import { DataTable, EmptyRow, TD, TH, THead, TR } from "@/components/ui/table";
import { PageTitle } from "@/components/settings/page-title";
import { Field } from "@/components/memory/add-context-modal";
import { useMembers } from "@/lib/data/queries";
import { useInviteMember, useRemoveMember } from "@/lib/data/mutations";

/** SPEC §8.8 */
export function PeopleView() {
  const [search, setSearch] = React.useState("");
  const [role, setRole] = React.useState<"all" | "admin" | "member">("all");
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const members = useMembers(search, role);
  const invite = useInviteMember();
  const remove = useRemoveMember();

  return (
    <div className="space-y-4">
      <PageTitle>People</PageTitle>
      <div className="flex items-center gap-3">
        <SearchInput
          wrapperClassName="flex-1"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by email"
        />
        <Select
          size="md"
          className="w-[124px]"
          value={role}
          onChange={setRole}
          options={[
            { value: "all" as const, label: "All roles" },
            { value: "admin" as const, label: "Admin" },
            { value: "member" as const, label: "Member" },
          ]}
        />
        <Button onClick={() => setInviteOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          Invite people
        </Button>
      </div>

      <DataTable>
        <THead>
          <tr>
            <TH>Email</TH>
            <TH className="w-[128px]">Role</TH>
            <TH className="w-[96px]">Actions</TH>
          </tr>
        </THead>
        <tbody>
          {members.length === 0 ? (
            <EmptyRow colSpan={3}>No people found</EmptyRow>
          ) : (
            members.map((member) => (
              <TR key={member.id}>
                <TD>
                  <span className="flex items-center gap-2.5">
                    <Avatar
                      seed={member.avatarSeed}
                      label={member.email}
                      size={22}
                    />
                    {member.email}
                    {member.isYou ? <Badge tone="muted">You</Badge> : null}
                  </span>
                </TD>
                <TD className="capitalize">{member.role}</TD>
                <TD>
                  {member.isYou ? null : (
                    <Button
                      variant="ghost"
                      aria-label={`Remove ${member.email}`}
                      onClick={() => remove(member.id)}
                      className="h-8 w-8 p-0 text-[hsl(var(--destructive))]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </TD>
              </TR>
            ))
          )}
        </tbody>
      </DataTable>

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite people"
        subtitle="They'll get access to every repository this organization reviews."
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              disabled={!email.includes("@")}
              onClick={() => {
                invite(email.trim());
                setEmail("");
                setInviteOpen(false);
              }}
            >
              Send invite
            </Button>
          </div>
        }
      >
        <div className="p-5">
          <Field label="Email">
            <Input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="teammate@company.com"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
