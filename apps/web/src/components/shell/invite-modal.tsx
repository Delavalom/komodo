"use client";

import * as React from "react";
import { Copy, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/display";

/** SPEC §2.5 — copy is verbatim. */
export function InviteModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [email, setEmail] = React.useState("");

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={658}
      icon={<Gift className="h-5 w-5 text-[hsl(var(--greptile-brand-green))]" />}
      title="Invite someone to Greptile"
      subtitle="Share Greptile with friends or teammates at qualified companies. We'll track invited people here, and eligible company switches can qualify for Switch 2 rewards."
      footer={
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" className="w-full">
            <Copy className="h-3.5 w-3.5" />
            Copy link
          </Button>
          <Button variant="secondary" className="w-full" disabled={!email.trim()}>
            Send invite
          </Button>
        </div>
      }
    >
      <div className="p-5">
        <div className="text-sm font-medium">Invite by email</div>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Add one or many email addresses. Press Enter after each email, or
          paste a comma-separated list.
        </p>
        <Input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="teammate@company.com"
          className="mt-3 h-10 bg-secondary"
        />
      </div>
    </Modal>
  );
}
