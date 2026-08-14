"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, TriangleAlert } from "lucide-react";
import { Button, cn } from "@/components/ui";
import { MODELS } from "@/lib/models";

const MIN_BALANCE = 25;

export function ReviewForm({
  balance,
  defaultModel,
}: {
  balance: number;
  defaultModel: string;
}) {
  const router = useRouter();
  const [prUrl, setPrUrl] = useState("");
  const [model, setModel] = useState(defaultModel);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const insufficient = balance < MIN_BALANCE;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prUrl, model }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Review failed");
        return;
      }
      router.push(`/reviews/${data.id}`);
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* PR URL */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <label htmlFor="pr-url" className="block text-sm font-medium text-text mb-1">
          Pull request URL
        </label>
        <p className="text-xs text-text-dim mb-3">
          Any pull request you can access with your GitHub token.
        </p>
        <input
          id="pr-url"
          type="url"
          required
          placeholder="https://github.com/owner/repo/pull/123"
          value={prUrl}
          onChange={(e) => setPrUrl(e.target.value)}
          disabled={loading}
          className="w-full h-10 px-3 rounded-lg bg-elevated border border-border text-sm text-text placeholder:text-text-faint font-mono focus:outline-none focus:border-accent-border focus:ring-2 focus:ring-accent/20 transition-colors disabled:opacity-50"
        />
      </div>

      {/* Model */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border">
          <h2 className="text-sm font-semibold text-text">Model</h2>
          <p className="text-xs text-text-dim mt-0.5">
            Charged at 1.5× the model&apos;s cost. Ranges are per review and vary with diff size.
          </p>
        </div>
        <div className="p-3 grid sm:grid-cols-2 gap-2">
          {MODELS.map((m) => {
            const selected = model === m.id;
            return (
              <label
                key={m.id}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg cursor-pointer border transition-colors",
                  selected
                    ? "border-accent-border bg-accent-dim"
                    : "border-border bg-elevated hover:border-border-strong",
                  loading && "pointer-events-none opacity-60",
                )}
              >
                <input
                  type="radio"
                  name="model"
                  value={m.id}
                  checked={selected}
                  onChange={() => setModel(m.id)}
                  className="sr-only"
                  disabled={loading}
                />
                <span
                  className={cn(
                    "size-3.5 rounded-full border-2 shrink-0 transition-colors",
                    selected ? "border-accent bg-accent" : "border-text-faint",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-text truncate">
                    {m.label}
                  </span>
                  <span className="block text-[11px] text-text-dim mt-0.5">
                    {m.vendor} · {m.hint}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {insufficient && (
        <div className="flex items-start gap-2.5 rounded-lg border border-major/30 bg-major/10 px-4 py-3">
          <TriangleAlert size={16} className="text-major shrink-0 mt-px" />
          <p className="text-xs text-major leading-relaxed">
            You have <strong className="font-semibold">{balance} credits</strong> — at least{" "}
            {MIN_BALANCE} are needed to start a review.{" "}
            <a href="/credits" className="underline hover:no-underline">
              Add credits
            </a>
          </p>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2.5 rounded-lg border border-critical/30 bg-critical/10 px-4 py-3">
          <TriangleAlert size={16} className="text-critical shrink-0 mt-px" />
          <p className="text-xs text-critical leading-relaxed">{error}</p>
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-text-dim">
          Balance:{" "}
          <span className={cn("font-semibold", insufficient ? "text-major" : "text-accent")}>
            {balance.toLocaleString()} credits
          </span>
        </p>
        <Button type="submit" variant="primary" disabled={loading || insufficient}>
          {loading ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              Reviewing…
            </>
          ) : (
            "Run review"
          )}
        </Button>
      </div>

      {loading && (
        <p className="text-xs text-text-dim text-center">
          Large diffs can take a few minutes. Leaving this page cancels the request.
        </p>
      )}
    </form>
  );
}
