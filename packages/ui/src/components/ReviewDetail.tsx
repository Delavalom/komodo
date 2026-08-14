"use client";

import type { ReviewRecord } from "../types";
import { fetchReview } from "../api";
import { useResource } from "../store";
import { bySeverity, ConfidenceMeter } from "../kit";
import { JudgementCard } from "./JudgementCard";
import { MarkdownBlock } from "./MarkdownBlock";
import { MermaidBlock } from "./MermaidBlock";

const EFFORT_LABEL: Record<number, string> = {
  1: "Trivial",
  2: "Small",
  3: "Moderate",
  4: "Large",
  5: "Very Large",
};

/* Constants carry only what every user of them agrees on. Competing
   utilities (colour, radius, spacing) are set at the call site — Tailwind
   resolves conflicts by stylesheet order, not class-string order. */
const STATE_MSG = "py-16 px-6 text-center text-sm leading-[1.7]";
const HEADING_TYPE =
  "text-[11px] font-semibold tracking-[0.09em] uppercase text-text-dim flex items-center gap-2";
const SECTION_HEADING = `${HEADING_TYPE} mb-3.5 pb-2.5 border-b border-border`;
const RAIL_HEADING = `${HEADING_TYPE} mb-2.5`;
const CARD = "bg-surface border border-border";
const WALKTHROUGH_TH =
  "pr-4 pb-2.5 text-left text-[11px] font-semibold tracking-[0.09em] uppercase text-text-dim border-b border-border";

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
      <div className="min-h-screen">
        <main className="max-w-[1100px] mx-auto px-6 pb-20">
          <div className={`${STATE_MSG} text-text-muted`}>Loading review…</div>
        </main>
      </div>
    );

  if (state.status === "error")
    return (
      <div className="min-h-screen">
        <main className="max-w-[1100px] mx-auto px-6 pb-20">
          <div className={`${STATE_MSG} text-critical`}>{state.error}</div>
        </main>
      </div>
    );

  const review = state.data;
  const { pr, result, files } = review;

  const sorted = [...result.judgements].sort(bySeverity);
  const highPriority = sorted.filter((f) => f.severity === "critical" || f.severity === "major");
  const lowPriority = sorted.filter((f) => f.severity === "minor" || f.severity === "trivial");

  const effortLabel = EFFORT_LABEL[result.effort] ?? String(result.effort);

  // Judgements per file, shown as counts in the left rail.
  const judgementsPerFile = new Map<string, number>();
  for (const f of sorted) {
    judgementsPerFile.set(f.path, (judgementsPerFile.get(f.path) ?? 0) + 1);
  }

  return (
    <div className="min-h-screen">
      {/* ---- Topbar ---- */}
      <header className="sticky top-0 z-30 flex items-center gap-4 h-14 px-6 border-b border-border bg-[color-mix(in_srgb,var(--color-bg)_85%,transparent)] backdrop-blur-[8px] max-[800px]:px-4">
        <button
          className="inline-flex items-center gap-1.5 text-text-muted text-[13px] cursor-pointer transition-colors hover:text-text"
          onClick={onBack}
        >
          ← All reviews
        </button>
        <div className="font-mono text-xs text-text-dim">
          {pr.owner}/{pr.repo}#{pr.number}
        </div>
        <a
          className="ml-auto text-xs text-text-muted transition-colors hover:text-accent"
          href={pr.url}
          target="_blank"
          rel="noreferrer"
        >
          View on GitHub ↗
        </a>
      </header>

      <div className="grid grid-cols-[240px_minmax(0,1fr)] max-[1000px]:grid-cols-[minmax(0,1fr)]">
        {/* ---- Left rail: files ---- */}
        <aside className="border-r border-border max-[1000px]:hidden">
          <div className="sticky top-14 max-h-[calc(100vh-56px)] overflow-y-auto px-4 py-5">
            <h2 className={RAIL_HEADING}>Files ({files.length})</h2>
            <ul className="list-none flex flex-col gap-0.5">
              {files.map((f) => {
                const count = judgementsPerFile.get(f.path) ?? 0;
                return (
                  <li
                    key={f.path}
                    className="px-2 py-1.5 rounded-md transition-colors hover:bg-surface-2"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="flex-1 min-w-0 font-mono text-[11px] text-text-muted overflow-hidden text-ellipsis whitespace-nowrap"
                        title={f.path}
                      >
                        {shortPath(f.path)}
                      </span>
                      {count > 0 && (
                        <span className="shrink-0 text-[10px] font-semibold tabular-nums rounded-full border border-border bg-surface-2 text-text-muted px-1.5">
                          {count}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 mt-0.5">
                      {f.additions > 0 && (
                        <span className="text-[10px] font-semibold text-accent tabular-nums">
                          +{f.additions}
                        </span>
                      )}
                      {f.deletions > 0 && (
                        <span className="text-[10px] font-semibold text-critical tabular-nums">
                          −{f.deletions}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>

        {/* ---- Right pane ---- */}
        <main className="min-w-0 max-w-[900px] px-6 pt-8 pb-20 max-[800px]:px-4 max-[800px]:pt-6 max-[800px]:pb-15">
          {/* Verdict */}
          <div className={`flex ${CARD} rounded-lg mb-9 overflow-hidden max-[800px]:flex-col`}>
            <div className="flex-1 min-w-0 p-7">
              <div className="flex items-center gap-2.5 mb-3">
                <span className="text-[52px] font-bold leading-none text-accent tracking-[-0.04em] tabular-nums max-[800px]:text-[40px]">
                  {result.confidence}
                </span>
                <span className="text-[22px] font-normal text-text-dim leading-none">/5</span>
                <ConfidenceMeter score={result.confidence} size="lg" />
              </div>
              <p className="text-sm text-text mb-3 leading-[1.5] max-w-[480px]">{result.verdict}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-text-muted">
                  Review effort:{" "}
                  <strong className="text-text font-medium">
                    {effortLabel} ({result.effort}/5)
                  </strong>
                </span>
                <span className="text-text-dim text-[11px]">·</span>
                <span className="text-xs text-text-muted">
                  Provider:{" "}
                  <strong className="text-text font-medium">
                    {review.provider}
                    {review.model ? ` / ${review.model}` : ""}
                  </strong>
                </span>
              </div>
            </div>

            <div className="flex-[0_0_300px] border-l border-border p-7 max-[800px]:border-l-0 max-[800px]:border-t max-[800px]:flex-none">
              <a
                className="block text-sm font-medium text-text mb-1.5 leading-[1.45] transition-colors hover:text-accent"
                href={pr.url}
                target="_blank"
                rel="noreferrer"
              >
                {pr.title}
              </a>
              <div className="font-mono text-[11px] text-text-dim mb-3">
                {pr.owner}/{pr.repo}#{pr.number}
              </div>
              <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
                <span className="font-mono text-[11px] px-[7px] py-0.5 bg-surface-2 border border-border rounded text-text-muted">
                  {pr.baseRef}
                </span>
                <span className="text-text-dim text-[11px]">←</span>
                <span className="font-mono text-[11px] px-[7px] py-0.5 bg-surface-2 border border-border rounded text-text-muted">
                  {pr.headRef}
                </span>
              </div>
              <div className="text-xs text-text-muted">
                by {pr.author} ·{" "}
                <code className="font-mono text-[11px] text-text-dim">
                  {pr.headSha.slice(0, 7)}
                </code>
              </div>
            </div>
          </div>

          {/* Judgements */}
          {sorted.length > 0 && (
            <section className="mb-10">
              <h2 className={SECTION_HEADING}>
                Judgements{" "}
                <span className="inline-flex items-center justify-center bg-surface-2 border border-border text-text-muted rounded-full text-[11px] px-[7px] min-w-[22px] h-[18px] normal-case tracking-normal font-medium">
                  {sorted.length}
                </span>
              </h2>

              {highPriority.length > 0 && (
                <div className="flex flex-col gap-2">
                  {highPriority.map((f, i) => (
                    <JudgementCard
                      key={`${f.path}:${f.line}:${i}`}
                      judgement={f}
                      pr={pr}
                      defaultOpen
                    />
                  ))}
                </div>
              )}

              {lowPriority.length > 0 && (
                <details className="group mt-2.5">
                  <summary className="list-none cursor-pointer text-xs text-text-muted py-1.5 select-none flex items-center gap-1.5 [&::-webkit-details-marker]:hidden">
                    <span className="text-[9px] text-text-dim transition-transform group-open:rotate-90">
                      ▶
                    </span>
                    Lower priority ({lowPriority.length})
                  </summary>
                  <div className="flex flex-col gap-2 mt-2">
                    {lowPriority.map((f, i) => (
                      <JudgementCard
                        key={`${f.path}:${f.line}:${i}`}
                        judgement={f}
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
            <section className="mb-10">
              <h2 className={SECTION_HEADING}>Walkthrough</h2>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className={WALKTHROUGH_TH}>Files</th>
                      <th className={WALKTHROUGH_TH}>Change Summary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.walkthrough.map((w, i) => (
                      <tr key={i} className="[&:last-child>td]:border-b-0">
                        <td className="pr-4 py-3 align-top border-b border-border text-[13px] w-[40%]">
                          <div className="flex flex-col gap-1">
                            {w.files.map((f) => (
                              <code
                                key={f}
                                className="font-mono text-[11px] text-text-muted block leading-[1.5]"
                              >
                                {f}
                              </code>
                            ))}
                          </div>
                        </td>
                        <td className="pr-4 py-3 align-top border-b border-border text-[13px] text-text leading-[1.6]">
                          {w.summary}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Summary */}
          <section className="mb-10">
            <h2 className={SECTION_HEADING}>Summary</h2>
            <div className={`${CARD} rounded-md px-5 py-[18px]`}>
              <MarkdownBlock content={result.summary} />
            </div>
          </section>

          {/* Diagram */}
          {result.diagram && (
            <section className="mb-10">
              <h2 className={SECTION_HEADING}>Diagram</h2>
              <div className={`${CARD} rounded-md p-7 overflow-x-auto flex justify-center`}>
                <MermaidBlock diagram={result.diagram} />
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
