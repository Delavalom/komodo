"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, useToast } from "@komodo/ui";

const CREDIT_PACKS = [
  { key: "POLAR_PRODUCT_500", credits: 500, label: "500 credits", price: "$5", hint: "~30 reviews" },
  {
    key: "POLAR_PRODUCT_2000",
    credits: 2000,
    label: "2,000 credits",
    price: "$18",
    hint: "~130 reviews",
    recommended: true,
  },
  {
    key: "POLAR_PRODUCT_10000",
    credits: 10000,
    label: "10,000 credits",
    price: "$80",
    hint: "~650 reviews",
  },
];

export function BuyCredits({
  polarEnabled,
  devTopupEnabled,
}: {
  polarEnabled: boolean;
  devTopupEnabled: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState<string | null>(null);

  async function buy(packKey: string) {
    setPending(packKey);
    try {
      const res = await fetch("/api/credits/polar-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack: packKey }),
      });
      const d = (await res.json()) as { url?: string; error?: string };
      if (d.url) {
        window.location.href = d.url;
        return;
      }
      toast.error(d.error ?? "Failed to create checkout");
    } catch {
      toast.error("Network error");
    } finally {
      setPending(null);
    }
  }

  async function devTopup() {
    setPending("dev");
    try {
      const res = await fetch("/api/credits/dev-topup", { method: "POST" });
      const d = (await res.json()) as { added?: number; error?: string };
      if (d.added) {
        toast.success(`Added ${d.added} credits`);
        router.refresh();
      } else {
        toast.error(d.error ?? "Top-up failed");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setPending(null);
    }
  }

  if (polarEnabled) {
    return (
      <section>
        <h2 className="text-sm font-semibold text-text mb-3">Buy credits</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          {CREDIT_PACKS.map((pack) => (
            <div
              key={pack.key}
              className={`flex flex-col rounded-xl border p-4 ${
                pack.recommended
                  ? "border-accent-border bg-accent-dim"
                  : "border-border bg-surface"
              }`}
            >
              {pack.recommended && (
                <span className="self-start mb-2 rounded-full border border-accent-border bg-bg/40 px-2 py-px text-[10px] font-semibold text-accent">
                  Recommended
                </span>
              )}
              <div className="text-2xl font-bold text-text tabular-nums leading-none">
                {pack.price}
              </div>
              <div className="text-sm font-medium text-text mt-2">{pack.label}</div>
              <div className="text-xs text-text-dim mt-0.5 mb-4">{pack.hint}</div>
              <Button
                variant={pack.recommended ? "primary" : "secondary"}
                size="sm"
                className="mt-auto w-full"
                disabled={pending !== null}
                onClick={() => void buy(pack.key)}
              >
                {pending === pack.key ? "Redirecting…" : "Buy"}
              </Button>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (devTopupEnabled) {
    return (
      <section className="rounded-xl border border-dashed border-border-strong bg-surface p-5">
        <h2 className="text-sm font-semibold text-text">Dev top-up</h2>
        <p className="text-xs text-text-dim mt-1 mb-3.5 leading-relaxed">
          Adds 500 test credits. Available only while <code className="font-mono">DEV_TOPUP_ENABLED=true</code>.
        </p>
        <Button size="sm" disabled={pending !== null} onClick={() => void devTopup()}>
          {pending === "dev" ? "Adding…" : "+ 500 credits (free)"}
        </Button>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-5 text-center">
      <p className="text-sm text-text-muted">Billing is not configured</p>
      <p className="text-xs text-text-dim mt-1">
        Set <code className="font-mono">POLAR_ACCESS_TOKEN</code> and the{" "}
        <code className="font-mono">POLAR_PRODUCT_*</code> variables to enable credit purchases.
      </p>
    </section>
  );
}
