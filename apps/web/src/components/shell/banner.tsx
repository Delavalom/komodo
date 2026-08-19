"use client";

import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CloseGlyph, TrexIcon } from "@/components/ui/display";
import { useOrganization } from "@/lib/data/queries";
import { DAY_MS, NOW } from "@/lib/utils";
import * as React from "react";

/** SPEC §2.1 — variant 1. */
export function TrialBanner() {
  const org = useOrganization();
  const daysLeft = Math.max(0, Math.round((org.trialEndsAt - NOW) / DAY_MS));

  return (
    <div className="flex h-[46px] shrink-0 items-center justify-center gap-4 bg-[hsl(var(--greptile-brand-green))] px-4 text-[hsl(var(--color-gray-950))]">
      <p className="truncate text-sm">
        <strong className="font-semibold">{daysLeft}</strong> days left in your
        free trial! Add a payment method now to use Greptile without disruption
      </p>
      <Button variant="white" size="sm" className="h-8 shrink-0">
        <CreditCard className="h-3.5 w-3.5" />
        Add Payment Method
      </Button>
    </div>
  );
}

/** SPEC §2.1 — variant 2, the one shown on /user/settings/*. */
export function TrexBanner() {
  const [dismissed, setDismissed] = React.useState(false);
  if (dismissed) return null;

  return (
    <div className="flex h-[46px] shrink-0 items-center justify-center gap-3 bg-[hsl(var(--greptile-brand-green))] px-4 text-[hsl(var(--color-gray-950))]">
      <TrexIcon className="h-4 w-4 shrink-0" />
      <p className="truncate text-sm">
        Introducing TREX, which gives Greptile the ability to run your changes
        in a sandbox to find more bugs.
      </p>
      <Button
        size="sm"
        className="h-8 shrink-0 border-transparent bg-[hsl(var(--color-gray-950))] text-white hover:bg-[hsl(var(--color-gray-800))]"
      >
        Turn it on for your org
      </Button>
      <Button variant="white" size="sm" className="h-8 shrink-0">
        Learn more
      </Button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        className="shrink-0 opacity-70 transition-opacity hover:opacity-100"
      >
        <CloseGlyph />
      </button>
    </div>
  );
}
