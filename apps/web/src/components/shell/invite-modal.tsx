"use client";

import * as React from "react";
import { Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/display";
import { useInviteMember } from "@/lib/data/mutations";

/**
 * Adding someone to the roster, from the account menu.
 *
 * It used to offer "Copy link" and "Send invite", and did neither: Komodo has
 * no sign-in, so there is no link to copy and no account to send anyone to.
 * What the button under it actually does is write a roster row — which is the
 * thing worth doing, because the roster is what files a decision under a name.
 */
export function InviteModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const invite = useInviteMember();
  const [emails, setEmails] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const parsed = emails
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter((value) => value.includes("@"));

  async function onAdd() {
    setPending(true);
    try {
      for (const email of parsed) await invite(email);
      setEmails("");
      onClose();
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={658}
      icon={<Gift className="h-5 w-5 text-[hsl(var(--komodo-brand-green))]" />}
      title="Add teammates to Komodo"
      subtitle="Komodo has no sign-in — anyone who can reach this deployment can already use it. The roster is what decides whose name a decision is filed under, so add them here and correct their GitHub login in People."
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            disabled={parsed.length === 0 || pending}
            onClick={onAdd}
          >
            {pending
              ? "Adding…"
              : `Add ${parsed.length || ""} to roster`.replace("  ", " ")}
          </Button>
        </div>
      }
    >
      <div className="p-5">
        <div className="text-sm font-medium">Email addresses</div>
        <p className="mt-1 text-[13px] text-muted-foreground">
          One or many — separated by commas or spaces. Each becomes a roster
          entry whose GitHub login is guessed from the address.
        </p>
        <Input
          value={emails}
          onChange={(event) => setEmails(event.target.value)}
          placeholder="teammate@company.com"
          className="mt-3 h-10 bg-secondary"
        />
      </div>
    </Modal>
  );
}
