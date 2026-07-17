"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const MODELS = [
  { id: "anthropic/claude-sonnet-4-5", label: "Claude Sonnet 4.5", hint: "≈ 15–80 credits" },
  { id: "anthropic/claude-opus-4-5", label: "Claude Opus 4.5", hint: "≈ 50–300 credits" },
  { id: "openai/gpt-5.1", label: "GPT-5.1", hint: "≈ 20–100 credits" },
  { id: "openai/gpt-5.1-codex", label: "GPT-5.1 Codex", hint: "≈ 30–150 credits" },
  { id: "google/gemini-3-pro", label: "Gemini 3 Pro", hint: "≈ 10–60 credits" },
  { id: "deepseek/deepseek-v3.2", label: "DeepSeek V3.2", hint: "≈ 5–20 credits" },
];

export function ReviewForm({ balance }: { balance: number }) {
  const router = useRouter();
  const [prUrl, setPrUrl] = useState("");
  const [model, setModel] = useState(MODELS[0].id);
  const [postToGithub, setPostToGithub] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");

  const selectedModel = MODELS.find((m) => m.id === model) ?? MODELS[0];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setProgress("Submitting review…");

    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prUrl, model, postToGithub }),
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
      setProgress("");
    }
  }

  const inputStyle: React.CSSProperties = {
    backgroundColor: "#111318",
    border: "1px solid #1E2128",
    borderRadius: "0.5rem",
    color: "#E5E7EB",
    padding: "0.625rem 0.875rem",
    fontSize: "0.875rem",
    width: "100%",
    outline: "none",
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* PR URL */}
      <div>
        <label className="block text-sm font-medium mb-2" style={{ color: "#9CA3AF" }}>
          PR URL
        </label>
        <input
          type="url"
          required
          placeholder="https://github.com/owner/repo/pull/123"
          value={prUrl}
          onChange={(e) => setPrUrl(e.target.value)}
          style={inputStyle}
          disabled={loading}
        />
      </div>

      {/* Model select */}
      <div>
        <label className="block text-sm font-medium mb-2" style={{ color: "#9CA3AF" }}>
          Model
        </label>
        <div className="grid gap-2">
          {MODELS.map((m) => (
            <label
              key={m.id}
              className="flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors"
              style={{
                backgroundColor: model === m.id ? "#161E18" : "#111318",
                border: `1px solid ${model === m.id ? "#3ECF8E" : "#1E2128"}`,
              }}
            >
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  name="model"
                  value={m.id}
                  checked={model === m.id}
                  onChange={() => setModel(m.id)}
                  className="sr-only"
                  disabled={loading}
                />
                <div
                  className="w-3.5 h-3.5 rounded-full border-2 flex-shrink-0"
                  style={{
                    borderColor: model === m.id ? "#3ECF8E" : "#4B5563",
                    backgroundColor: model === m.id ? "#3ECF8E" : "transparent",
                  }}
                />
                <span className="text-sm font-medium" style={{ color: "#E5E7EB" }}>
                  {m.label}
                </span>
              </div>
              <span className="text-xs" style={{ color: "#6B7280" }}>
                {m.hint}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Post to GitHub checkbox */}
      <label className="flex items-center gap-3 cursor-pointer">
        <div className="relative">
          <input
            type="checkbox"
            checked={postToGithub}
            onChange={(e) => setPostToGithub(e.target.checked)}
            className="sr-only"
            disabled={loading}
          />
          <div
            className="w-5 h-5 rounded flex items-center justify-center"
            style={{
              backgroundColor: postToGithub ? "#3ECF8E" : "#1E2128",
              border: `1px solid ${postToGithub ? "#3ECF8E" : "#374151"}`,
            }}
          >
            {postToGithub && (
              <svg className="w-3 h-3" fill="none" stroke="#0A0B0D" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        </div>
        <div>
          <span className="text-sm font-medium" style={{ color: "#E5E7EB" }}>
            Post review to GitHub
          </span>
          <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
            Post findings as a review comment on the PR using your GitHub token
          </p>
        </div>
      </label>

      {/* Balance info */}
      <div className="text-xs" style={{ color: "#6B7280" }}>
        Your balance:{" "}
        <span style={{ color: balance < 25 ? "#EF4444" : "#3ECF8E" }} className="font-semibold">
          {balance} credits
        </span>
        {balance < 25 && (
          <span className="ml-2" style={{ color: "#EF4444" }}>
            — need at least 25 to review.{" "}
            <a href="/credits" style={{ color: "#3ECF8E" }}>
              Add credits →
            </a>
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="text-sm px-4 py-3 rounded-lg" style={{ backgroundColor: "#1A0D0D", border: "1px solid #7F1D1D", color: "#FCA5A5" }}>
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading || balance < 25}
        className="w-full py-3 rounded-lg font-semibold text-sm transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
        style={{ backgroundColor: "#3ECF8E", color: "#0A0B0D" }}
      >
        {loading ? (
          <>
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Running review — this can take up to 5 minutes…
          </>
        ) : (
          "Run review"
        )}
      </button>

      {loading && progress && (
        <p className="text-xs text-center" style={{ color: "#6B7280" }}>
          {progress}
        </p>
      )}
    </form>
  );
}
