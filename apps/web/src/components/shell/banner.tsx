"use client";

import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNow } from "@/lib/data/provider";
import { useOrganization } from "@/lib/data/queries";
import { DAY_MS } from "@/lib/utils";

/**
 * The trial countdown.
 *
 * Only ever true of a hosted tier — a self-hosted deployment has no trial and
 * no payment method — so the layout renders it behind IS_CLOUD.
 */
export function TrialBanner() {
  const org = useOrganization();
  const daysLeft = Math.max(0, Math.round((org.trialEndsAt - useNow()) / DAY_MS));

  return (
    <div className="flex h-[46px] shrink-0 items-center justify-center gap-4 bg-[hsl(var(--komodo-brand-green))] px-4 text-[hsl(var(--color-gray-950))]">
      <p className="truncate text-sm">
        <strong className="font-semibold">{daysLeft}</strong> days left in your
        free trial! Add a payment method now to keep Komodo running
      </p>
      <Button variant="white" size="sm" className="h-8 shrink-0">
        <CreditCard className="h-3.5 w-3.5" />
        Add Payment Method
      </Button>
    </div>
  );
}
