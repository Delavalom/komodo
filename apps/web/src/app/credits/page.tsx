"use client";

import { useEffect, useState } from "react";

const CREDIT_PACKS = [
  { key: "POLAR_PRODUCT_500", credits: 500, label: "500 credits", price: "$5", description: "~30 reviews" },
  { key: "POLAR_PRODUCT_2000", credits: 2000, label: "2,000 credits", price: "$18", description: "~130 reviews" },
  { key: "POLAR_PRODUCT_10000", credits: 10000, label: "10,000 credits", price: "$80", description: "~650 reviews" },
];

interface LedgerRow {
  id: string;
  delta: number;
  reason: string;
  ref: string | null;
  createdAt: string;
}

interface CreditsData {
  balance: number;
  ledger: LedgerRow[];
  polarEnabled: boolean;
  devTopupEnabled: boolean;
}

export default function CreditsPage() {
  const [data, setData] = useState<CreditsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [buying, setBuying] = useState<string | null>(null);
  const [topping, setTopping] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/credits/summary")
      .then((r) => r.json())
      .then((d: CreditsData) => setData(d))
      .catch(() => setError("Failed to load credits"));

    // Check for success redirect from Polar
    if (typeof window !== "undefined" && window.location.search.includes("success=true")) {
      setSuccessMsg("Payment successful! Credits will appear shortly.");
      window.history.replaceState({}, "", "/credits");
    }
  }, []);

  async function buyCredits(packKey: string) {
    setBuying(packKey);
    try {
      const res = await fetch("/api/credits/polar-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack: packKey }),
      });
      const d = (await res.json()) as { url?: string; error?: string };
      if (d.url) {
        window.location.href = d.url;
      } else {
        setError(d.error ?? "Failed to create checkout");
      }
    } catch {
      setError("Network error");
    } finally {
      setBuying(null);
    }
  }

  async function devTopup() {
    setTopping(true);
    try {
      const res = await fetch("/api/credits/dev-topup", { method: "POST" });
      const d = (await res.json()) as { added?: number; error?: string };
      if (d.added) {
        setSuccessMsg(`Added ${d.added} credits!`);
        // Refresh
        const fresh = await fetch("/api/credits/summary").then((r) => r.json() as Promise<CreditsData>);
        setData(fresh);
      } else {
        setError(d.error ?? "Top-up failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setTopping(false);
    }
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto py-8 text-center" style={{ color: "#EF4444" }}>
        {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-2xl mx-auto py-8 text-center" style={{ color: "#6B7280" }}>
        Loading…
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "#E5E7EB" }}>
          Credits
        </h1>
        <p className="text-sm mt-1" style={{ color: "#6B7280" }}>
          1 credit = $0.01. Reviews are charged at 1.5× the model cost.
        </p>
      </div>

      {successMsg && (
        <div
          className="px-4 py-3 rounded-lg text-sm"
          style={{ backgroundColor: "#061A10", border: "1px solid #065F46", color: "#6EE7B7" }}
        >
          {successMsg}
        </div>
      )}

      {/* Balance */}
      <div className="rounded-xl p-6" style={{ backgroundColor: "#111318", border: "1px solid #1E2128" }}>
        <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#6B7280" }}>
          Current balance
        </div>
        <div className="text-4xl font-bold" style={{ color: "#3ECF8E" }}>
          {data.balance.toLocaleString()}{" "}
          <span className="text-xl font-normal" style={{ color: "#6B7280" }}>
            credits
          </span>
        </div>
      </div>

      {/* Buy credits */}
      <div>
        <h2 className="text-sm font-semibold mb-4" style={{ color: "#E5E7EB" }}>
          Buy credits
        </h2>

        {data.polarEnabled ? (
          <div className="grid gap-3">
            {CREDIT_PACKS.map((pack) => (
              <div
                key={pack.key}
                className="flex items-center justify-between p-4 rounded-xl"
                style={{ backgroundColor: "#111318", border: "1px solid #1E2128" }}
              >
                <div>
                  <div className="font-semibold text-sm" style={{ color: "#E5E7EB" }}>
                    {pack.label}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
                    {pack.description}
                  </div>
                </div>
                <button
                  onClick={() => buyCredits(pack.key)}
                  disabled={buying === pack.key}
                  className="px-4 py-2 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-60"
                  style={{ backgroundColor: "#3ECF8E", color: "#0A0B0D" }}
                >
                  {buying === pack.key ? "…" : pack.price}
                </button>
              </div>
            ))}
          </div>
        ) : data.devTopupEnabled ? (
          <div
            className="p-4 rounded-xl"
            style={{ backgroundColor: "#111318", border: "1px dashed #374151" }}
          >
            <div className="text-sm font-semibold mb-1" style={{ color: "#E5E7EB" }}>
              Dev top-up
            </div>
            <p className="text-xs mb-3" style={{ color: "#6B7280" }}>
              Adds 500 test credits. Only available in development (DEV_TOPUP_ENABLED=true).
            </p>
            <button
              onClick={devTopup}
              disabled={topping}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-60"
              style={{ backgroundColor: "#1E2128", color: "#E5E7EB", border: "1px solid #374151" }}
            >
              {topping ? "Adding…" : "+ 500 credits (free)"}
            </button>
          </div>
        ) : (
          <div
            className="p-4 rounded-xl text-sm text-center"
            style={{ backgroundColor: "#111318", border: "1px solid #1E2128", color: "#4B5563" }}
          >
            Billing not configured. Set POLAR_ACCESS_TOKEN + POLAR_PRODUCT_* env vars to enable paid credits.
          </div>
        )}
      </div>

      {/* Ledger */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #1E2128" }}>
        <div className="px-4 py-3" style={{ borderBottom: "1px solid #1E2128" }}>
          <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#6B7280" }}>
            Transaction history
          </h2>
        </div>
        {data.ledger.length === 0 ? (
          <div className="py-10 text-center text-sm" style={{ color: "#4B5563" }}>
            No transactions yet
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid #1E2128", backgroundColor: "#0D0F12" }}>
                {["When", "Reason", "Credits"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-widest"
                    style={{ color: "#4B5563" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.ledger.map((row) => (
                <tr key={row.id} style={{ borderBottom: "1px solid #161A22" }}>
                  <td className="px-4 py-2.5 text-xs" style={{ color: "#6B7280" }}>
                    {new Date(row.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono" style={{ color: "#9CA3AF" }}>
                    {row.reason}
                    {row.ref && (
                      <span className="ml-2" style={{ color: "#4B5563" }}>
                        ({row.ref.slice(0, 12)}…)
                      </span>
                    )}
                  </td>
                  <td
                    className="px-4 py-2.5 text-sm font-semibold"
                    style={{ color: row.delta > 0 ? "#3ECF8E" : "#EF4444" }}
                  >
                    {row.delta > 0 ? "+" : ""}
                    {row.delta}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
