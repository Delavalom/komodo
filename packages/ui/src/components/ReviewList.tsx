"use client";

import type { ReviewSummary } from "../types";
import { fetchReviews } from "../api";
import { useResource } from "../store";
import { ConfidenceMeter } from "../kit";

/* No colour here — callers pick it, so the error variant does not have to
   fight a base utility for the same property. */
const STATE_MSG = "py-16 px-6 text-center text-sm leading-[1.7]";
const TH = "pr-5 pb-3 text-left text-[11px] font-semibold tracking-[0.09em] uppercase text-text-dim whitespace-nowrap last:pr-0";
const TD = "py-4 pr-5 align-middle last:pr-0";
const BADGE = "inline-block px-[9px] py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function ReviewList() {
  const state = useResource<ReviewSummary[]>("reviews", fetchReviews);

  if (state.status === "loading")
    return <div className={`${STATE_MSG} text-text-muted`}>Loading reviews…</div>;
  if (state.status === "error")
    return <div className={`${STATE_MSG} text-critical`}>{state.error}</div>;

  const reviews = state.data;

  if (reviews.length === 0)
    return (
      <div className={`${STATE_MSG} text-text-muted`}>
        No reviews yet. Run{" "}
        <code className="bg-surface px-[7px] py-0.5 rounded text-xs text-accent border border-border">
          komodo-review pr &lt;url&gt;
        </code>{" "}
        to create one.
      </div>
    );

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className={TH}>Pull Request</th>
            <th className={TH}>Provider</th>
            <th className={TH}>Confidence</th>
            <th className={TH}>Judgements</th>
            <th className={TH}>When</th>
            <th className={TH}>Status</th>
          </tr>
        </thead>
        <tbody>
          {reviews.map((r) => (
            <tr
              key={r.id}
              className="border-b border-border transition-colors hover:bg-hover cursor-pointer"
              onClick={() => {
                window.location.hash = `#/reviews/${encodeURIComponent(r.id)}`;
              }}
            >
              <td className={TD}>
                <div className="text-[13px] font-medium text-text mb-[3px] max-w-[380px] leading-[1.4] max-[800px]:max-w-none">
                  {r.pr.title}
                </div>
                <div className="font-mono text-[11px] text-text-dim">
                  {r.pr.owner}/{r.pr.repo}#{r.pr.number}
                </div>
              </td>
              <td className={TD}>
                <span
                  className={`${BADGE} bg-surface-2 text-text-muted border border-border capitalize`}
                >
                  {r.provider}
                </span>
              </td>
              <td className={TD}>
                <ConfidenceMeter score={r.confidence} size="sm" />
              </td>
              <td className={TD}>
                <span
                  className={`text-[13px] font-medium tabular-nums ${
                    r.judgements > 0 ? "text-major" : "text-text-dim"
                  }`}
                >
                  {r.judgements}
                </span>
              </td>
              <td className={`${TD} text-xs text-text-muted whitespace-nowrap`}>
                {timeAgo(r.createdAt)}
              </td>
              <td className={TD}>
                <span
                  className={`${BADGE} ${
                    r.posted
                      ? "bg-accent-dim text-accent border border-accent-border"
                      : "bg-surface-2 text-text-dim border border-border"
                  }`}
                >
                  {r.posted ? "Posted" : "Local"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
