"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/controls";
import { Input, SearchInput } from "@/components/ui/input";
import { Avatar, Badge, Modal, Tooltip } from "@/components/ui/display";
import { DataTable, EmptyRow, TD, TH, THead, TR } from "@/components/ui/table";
import { PageTitle } from "@/components/settings/page-title";
import { Field } from "@/components/memory/add-context-modal";
import { useMembers } from "@/lib/data/queries";
import {
  useInviteMember,
  useRemoveMember,
  useUpdateMember,
} from "@/lib/data/mutations";
import type { Member } from "@/lib/types";

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
            <TH className="w-[220px]">
              <span className="inline-flex items-center gap-1">
                GitHub login
                <Tooltip content="The key that matches a person to their pull requests. Wrong here means their queue is silently empty.">
                  <span className="text-[10px]">ⓘ</span>
                </Tooltip>
              </span>
            </TH>
            <TH className="w-[128px]">Role</TH>
            <TH className="w-[96px]">Actions</TH>
          </tr>
        </THead>
        <tbody>
          {members.length === 0 ? (
            <EmptyRow colSpan={4}>No people found</EmptyRow>
          ) : (
            members.map((member) => (
              <MemberRow key={member.id} member={member} onRemove={remove} />
            ))
          )}
        </tbody>
      </DataTable>

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Add a teammate"
        subtitle="Komodo has no sign-in — this adds someone to the roster so their pull requests, answers and votes are filed under their own name."
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
              Add to roster
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

/**
 * One teammate, correctable in place.
 *
 * The login and the role are the two fields that do something: the login joins
 * a person to their pull requests, and the role is what the org screen reads.
 * Both were display-only, on rows an invite had guessed — an invite carries an
 * email and nothing else, so `renata@acme.com` became the login `renata`,
 * which is right about as often as it is not.
 */
function MemberRow({
  member,
  onRemove,
}: {
  member: Member;
  onRemove: (id: string) => Promise<void>;
}) {
  const update = useUpdateMember();
  const [login, setLogin] = React.useState(member.githubLogin);
  const [error, setError] = React.useState<string | null>(null);

  async function save(patch: { githubLogin?: string; role?: Member["role"] }) {
    setError(null);
    try {
      await update(member.id, patch);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLogin(member.githubLogin);
    }
  }

  return (
    <TR>
      <TD>
        <span className="flex items-center gap-2.5">
          <Avatar seed={member.avatarSeed} label={member.email} size={22} />
          {member.email}
          {member.isYou ? <Badge tone="muted">You</Badge> : null}
        </span>
      </TD>
      <TD>
        <Input
          value={login}
          onChange={(event) => setLogin(event.target.value)}
          onBlur={() =>
            login.trim() && login !== member.githubLogin
              ? save({ githubLogin: login.trim() })
              : setLogin(member.githubLogin)
          }
          aria-label={`GitHub login for ${member.email}`}
          className="h-8 font-mono text-[13px]"
        />
        {error ? (
          <div className="mt-1 text-xs text-[hsl(var(--destructive))]">{error}</div>
        ) : null}
      </TD>
      <TD>
        <Select
          size="md"
          className="w-[112px]"
          value={member.role}
          onChange={(role) => save({ role })}
          options={[
            { value: "admin" as const, label: "Admin" },
            { value: "member" as const, label: "Member" },
          ]}
        />
      </TD>
      <TD>
        {member.isYou ? null : (
          <Button
            variant="ghost"
            aria-label={`Remove ${member.email}`}
            onClick={() => onRemove(member.id)}
            className="h-8 w-8 p-0 text-[hsl(var(--destructive))]"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </TD>
    </TR>
  );
}
