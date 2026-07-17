import { useEffect, useState } from "react";
import type { ReviewSummary } from "../types";
import { fetchReviews } from "../api";
import { ConfidenceMeter } from "./ConfidenceMeter";

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
  const [reviews, setReviews] = useState<ReviewSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchReviews()
      .then(setReviews)
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="state-msg">Loading reviews…</div>;
  if (error) return <div className="state-msg state-msg--error">{error}</div>;
  if (reviews.length === 0)
    return (
      <div className="state-msg">
        No reviews yet. Run <code>komodo-review pr &lt;url&gt;</code> to create one.
      </div>
    );

  return (
    <div className="review-list">
      <table className="review-table">
        <thead>
          <tr>
            <th>Pull Request</th>
            <th>Provider</th>
            <th>Confidence</th>
            <th>Findings</th>
            <th>When</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {reviews.map((r) => (
            <tr
              key={r.id}
              className="review-row"
              onClick={() => {
                window.location.hash = `#/reviews/${encodeURIComponent(r.id)}`;
              }}
            >
              <td>
                <div className="pr-title">{r.pr.title}</div>
                <div className="pr-ref">
                  {r.pr.owner}/{r.pr.repo}#{r.pr.number}
                </div>
              </td>
              <td>
                <span className="provider-badge">{r.provider}</span>
              </td>
              <td>
                <ConfidenceMeter score={r.confidence} size="sm" />
              </td>
              <td>
                <span className={r.findings > 0 ? "findings-count findings-count--nonzero" : "findings-count"}>
                  {r.findings}
                </span>
              </td>
              <td className="when">{timeAgo(r.createdAt)}</td>
              <td>
                <span className={`status-badge status-badge--${r.posted ? "posted" : "local"}`}>
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
