import type { ReviewRecord } from "../types";
import { fetchReview } from "../api";
import { useResource } from "../store";
import { ConfidenceMeter } from "./ConfidenceMeter";
import { FindingCard } from "./FindingCard";
import { MarkdownBlock } from "./MarkdownBlock";
import { MermaidBlock } from "./MermaidBlock";

const SEVERITY_RANK: Record<string, number> = {
  critical: 3,
  major: 2,
  minor: 1,
  trivial: 0,
};

const EFFORT_LABEL: Record<number, string> = {
  1: "Trivial",
  2: "Small",
  3: "Moderate",
  4: "Large",
  5: "Very Large",
};

/**
 * Compact path label for the file rail. Uses the last two segments so that
 * same-named files in different directories (middleware/auth.ts vs
 * routes/auth.ts) stay distinguishable.
 */
function shortPath(path: string): string {
  const parts = path.split("/");
  return parts.length <= 2 ? path : parts.slice(-2).join("/");
}

interface Props {
  id: string;
  onBack: () => void;
}

export function ReviewDetail({ id, onBack }: Props) {
  const state = useResource<ReviewRecord>(`review:${id}`, () => fetchReview(id));

  if (state.status === "loading")
    return (
      <div className="app-shell">
        <main className="app-main">
          <div className="state-msg">Loading review…</div>
        </main>
      </div>
    );

  if (state.status === "error")
    return (
      <div className="app-shell">
        <main className="app-main">
          <div className="state-msg state-msg--error">{state.error}</div>
        </main>
      </div>
    );

  const review = state.data;
  const { pr, result, files } = review;

  const sorted = [...result.findings].sort(
    (a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0),
  );
  const highPriority = sorted.filter((f) => f.severity === "critical" || f.severity === "major");
  const lowPriority = sorted.filter((f) => f.severity === "minor" || f.severity === "trivial");

  const effortLabel = EFFORT_LABEL[result.effort] ?? String(result.effort);

  // Findings per file, shown as counts in the left rail.
  const findingsPerFile = new Map<string, number>();
  for (const f of sorted) {
    findingsPerFile.set(f.path, (findingsPerFile.get(f.path) ?? 0) + 1);
  }

  return (
    <div className="detail-shell">
      {/* ---- Topbar ---- */}
      <header className="detail-topbar">
        <button className="back-btn" onClick={onBack}>
          ← All reviews
        </button>
        <div className="detail-topbar__ref">
          {pr.owner}/{pr.repo}#{pr.number}
        </div>
        <a className="detail-topbar__link" href={pr.url} target="_blank" rel="noreferrer">
          View on GitHub ↗
        </a>
      </header>

      <div className="detail-layout">
        {/* ---- Left rail: files ---- */}
        <aside className="detail-rail">
          <div className="detail-rail__inner">
            <h2 className="section-heading section-heading--rail">Files ({files.length})</h2>
            <ul className="rail-files">
              {files.map((f) => {
                const count = findingsPerFile.get(f.path) ?? 0;
                return (
                  <li key={f.path} className="rail-file">
                    <div className="rail-file__top">
                      <span className="rail-file__name" title={f.path}>
                        {shortPath(f.path)}
                      </span>
                      {count > 0 && <span className="rail-file__count">{count}</span>}
                    </div>
                    <div className="rail-file__stats">
                      {f.additions > 0 && <span className="additions">+{f.additions}</span>}
                      {f.deletions > 0 && <span className="deletions">−{f.deletions}</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>

        {/* ---- Right pane ---- */}
        <main className="detail-content">
          {/* Verdict */}
          <div className="verdict-card">
            <div className="verdict-card__left">
              <div className="verdict-confidence">
                <span className="verdict-score">{result.confidence}</span>
                <span className="verdict-score-max">/5</span>
                <ConfidenceMeter score={result.confidence} size="lg" />
              </div>
              <p className="verdict-text">{result.verdict}</p>
              <div className="verdict-meta">
                <span className="verdict-meta__item">
                  Review effort:{" "}
                  <strong>
                    {effortLabel} ({result.effort}/5)
                  </strong>
                </span>
                <span className="verdict-meta__sep">·</span>
                <span className="verdict-meta__item">
                  Provider:{" "}
                  <strong>
                    {review.provider}
                    {review.model ? ` / ${review.model}` : ""}
                  </strong>
                </span>
              </div>
            </div>

            <div className="verdict-card__right">
              <a className="pr-meta__title" href={pr.url} target="_blank" rel="noreferrer">
                {pr.title}
              </a>
              <div className="pr-meta__ref">
                {pr.owner}/{pr.repo}#{pr.number}
              </div>
              <div className="pr-meta__branches">
                <span className="branch-chip">{pr.baseRef}</span>
                <span className="branch-arrow">←</span>
                <span className="branch-chip">{pr.headRef}</span>
              </div>
              <div className="pr-meta__author">
                by {pr.author} · <code className="sha">{pr.headSha.slice(0, 7)}</code>
              </div>
            </div>
          </div>

          {/* Findings */}
          {sorted.length > 0 && (
            <section className="detail-section">
              <h2 className="section-heading">
                Findings <span className="findings-count-badge">{sorted.length}</span>
              </h2>

              {highPriority.length > 0 && (
                <div className="findings-group">
                  {highPriority.map((f, i) => (
                    <FindingCard key={`${f.path}:${f.line}:${i}`} finding={f} pr={pr} defaultOpen />
                  ))}
                </div>
              )}

              {lowPriority.length > 0 && (
                <details className="findings-lower">
                  <summary className="findings-lower__summary">
                    <span className="findings-lower__caret">▶</span>
                    Lower priority ({lowPriority.length})
                  </summary>
                  <div className="findings-group findings-group--lower">
                    {lowPriority.map((f, i) => (
                      <FindingCard
                        key={`${f.path}:${f.line}:${i}`}
                        finding={f}
                        pr={pr}
                        defaultOpen={false}
                      />
                    ))}
                  </div>
                </details>
              )}
            </section>
          )}

          {/* Walkthrough */}
          {result.walkthrough.length > 0 && (
            <section className="detail-section">
              <h2 className="section-heading">Walkthrough</h2>
              <div className="walkthrough-table-wrapper">
                <table className="walkthrough-table">
                  <thead>
                    <tr>
                      <th>Files</th>
                      <th>Change Summary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.walkthrough.map((w, i) => (
                      <tr key={i}>
                        <td className="walkthrough-files">
                          {w.files.map((f) => (
                            <code key={f} className="file-path">
                              {f}
                            </code>
                          ))}
                        </td>
                        <td className="walkthrough-summary">{w.summary}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Summary */}
          <section className="detail-section">
            <h2 className="section-heading">Summary</h2>
            <div className="summary-card">
              <MarkdownBlock content={result.summary} />
            </div>
          </section>

          {/* Diagram */}
          {result.diagram && (
            <section className="detail-section">
              <h2 className="section-heading">Diagram</h2>
              <div className="diagram-card">
                <MermaidBlock diagram={result.diagram} />
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
