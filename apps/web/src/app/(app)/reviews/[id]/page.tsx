import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { marked } from "marked";
import { ExternalLink } from "lucide-react";
import { auth } from "@/auth";
import { getDb, reviews } from "@/db";
import { modelLabel } from "@/lib/models";
import { PageHeader } from "@/components/shell/PageHeader";
import {
  Chip,
  ConfidenceMeter,
  SEVERITY_COLOR,
  SectionLabel,
  bySeverity,
  isSeverity,
} from "@/components/ui";
import { JudgementCard } from "./judgement-card";
import { LowerJudgements } from "./lower-judgements";

function renderMd(md: string): string {
  return marked.parse(md) as string;
}

/**
 * Compact path label for the file rail. Uses the last two segments so that
 * same-named files in different directories (middleware/auth.ts vs
 * routes/auth.ts) stay distinguishable.
 */
function shortPath(path: string): string {
  const parts = path.split("/");
  return parts.length <= 2 ? path : parts.slice(-2).join("/");
}

const EFFORT_LABEL: Record<number, string> = {
  1: "Trivial",
  2: "Small",
  3: "Moderate",
  4: "Large",
  5: "Very large",
};

export default async function ReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const { id } = await params;
  const db = getDb();
  const [review] = await db.select().from(reviews).where(eq(reviews.id, id)).limit(1);

  if (!review || review.userId !== session.user.id) notFound();

  const record = review.record;
  if (!record) notFound();

  const { result, files, pr } = record;

  const sorted = [...result.judgements].sort(bySeverity);
  const high = sorted.filter((f) => f.severity === "critical" || f.severity === "major");
  const lower = sorted.filter((f) => f.severity === "minor" || f.severity === "trivial");

  // Markdown is rendered on the server so `marked` never ships to the client.
  const bodyHtml = new Map(sorted.map((j, i) => [i, renderMd(`${j.lede}\n\n${j.detail}`)]));
  const indexOf = new Map(sorted.map((f, i) => [f, i]));

  // Judgements per file, for the left rail.
  const judgementsPerFile = new Map<string, number>();
  for (const f of sorted) {
    judgementsPerFile.set(f.path, (judgementsPerFile.get(f.path) ?? 0) + 1);
  }

  const severityTotals = sorted.reduce<Record<string, number>>((acc, f) => {
    acc[f.severity] = (acc[f.severity] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Komodo", href: "/" },
          { label: "Reviews", href: "/" },
          { label: `${review.owner}/${review.repo}#${review.number}` },
        ]}
        actions={
          <a
            href={pr.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-border bg-surface-2 text-xs text-text-muted hover:text-text hover:border-border-strong transition-colors"
          >
            <ExternalLink size={13} />
            View on GitHub
          </a>
        }
      />

      <div className="flex-1 grid lg:grid-cols-[240px_minmax(0,1fr)] gap-0">
        {/* ---- Left rail: files + finding counts ---- */}
        <aside className="hidden lg:block border-r border-border">
          <div className="sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto p-4">
            <SectionLabel className="mb-3">Files ({files.length})</SectionLabel>
            <ul className="space-y-0.5">
              {files.map((f) => {
                const count = judgementsPerFile.get(f.path) ?? 0;
                return (
                  <li key={f.path}>
                    <div className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2 transition-colors">
                      <span
                        className="flex-1 min-w-0 font-mono text-[11px] text-text-muted truncate"
                        title={f.path}
                      >
                        {shortPath(f.path)}
                      </span>
                      {count > 0 && (
                        <span className="shrink-0 text-[10px] font-semibold tabular-nums rounded-full bg-surface-2 border border-border px-1.5 text-text-muted">
                          {count}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 px-2 pb-1 text-[10px] tabular-nums">
                      {f.additions > 0 && <span className="text-accent">+{f.additions}</span>}
                      {f.deletions > 0 && <span className="text-critical">−{f.deletions}</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>

        {/* ---- Right pane ---- */}
        <main className="min-w-0 px-6 py-8 max-w-4xl">
          {/* Verdict */}
          <section className="bg-surface border border-border rounded-xl overflow-hidden mb-8">
            <div className="flex flex-col md:flex-row">
              <div className="flex-1 min-w-0 p-6">
                <div className="flex items-center gap-3 mb-3">
                  <span
                    className="text-5xl font-bold leading-none tabular-nums tracking-tight"
                    style={{
                      color:
                        result.confidence >= 4
                          ? "var(--color-accent)"
                          : result.confidence >= 2
                            ? "var(--color-minor)"
                            : "var(--color-critical)",
                    }}
                  >
                    {result.confidence}
                  </span>
                  <span className="text-xl text-text-faint leading-none">/5</span>
                  <ConfidenceMeter score={result.confidence} size="lg" showLabel={false} />
                </div>

                <p className="text-sm text-text leading-relaxed mb-4 max-w-lg">{result.verdict}</p>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-text-dim">
                  <span>
                    Effort:{" "}
                    <strong className="font-medium text-text">
                      {EFFORT_LABEL[result.effort] ?? result.effort} ({result.effort}/5)
                    </strong>
                  </span>
                  <span>
                    Model:{" "}
                    <strong className="font-medium text-text">{modelLabel(review.model)}</strong>
                  </span>
                  <span>
                    Cost:{" "}
                    <strong className="font-medium text-text tabular-nums">
                      ${Number(review.costUsd ?? 0).toFixed(4)}
                    </strong>
                  </span>
                  <span>
                    Credits:{" "}
                    <strong className="font-medium text-text tabular-nums">
                      {review.creditsCharged}
                    </strong>
                  </span>
                </div>
              </div>

              <div className="md:w-[280px] shrink-0 border-t md:border-t-0 md:border-l border-border p-6">
                <a
                  href={pr.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-sm font-medium text-text hover:text-accent transition-colors leading-snug mb-1.5"
                >
                  {pr.title}
                </a>
                <div className="font-mono text-[11px] text-text-faint mb-3">
                  {pr.owner}/{pr.repo}#{pr.number}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                  <Chip mono>{pr.baseRef}</Chip>
                  <span className="text-text-faint text-[11px]">←</span>
                  <Chip mono>{pr.headRef}</Chip>
                </div>
                <div className="text-xs text-text-dim">
                  by {pr.author} ·{" "}
                  <code className="font-mono text-[11px] text-text-faint">
                    {pr.headSha.slice(0, 7)}
                  </code>
                </div>
                <div className="text-xs text-text-faint mt-1.5">
                  {new Date(review.createdAt).toLocaleString()}
                </div>
              </div>
            </div>
          </section>

          {/* Judgements */}
          <section className="mb-10">
            <div className="flex items-center justify-between gap-4 pb-2.5 mb-3.5 border-b border-border">
              <SectionLabel>Judgements ({sorted.length})</SectionLabel>
              {sorted.length > 0 && (
                <div className="flex items-center gap-2.5">
                  {Object.entries(severityTotals).map(([severity, n]) => (
                    <span
                      key={severity}
                      className="inline-flex items-center gap-1 text-[11px] tabular-nums"
                      style={{
                        color: isSeverity(severity) ? SEVERITY_COLOR[severity] : undefined,
                      }}
                    >
                      <span className="inline-block size-1.5 rounded-full bg-current" />
                      {n}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {sorted.length === 0 ? (
              <div className="rounded-xl border border-accent-border bg-accent-dim px-6 py-8 text-center">
                <p className="text-sm text-accent font-medium">Nothing to judge</p>
                <p className="text-xs text-text-dim mt-1">This pull request looks clean.</p>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  {high.map((f) => (
                    <JudgementCard
                      key={`${f.path}:${f.line}:${indexOf.get(f)}`}
                      judgement={f}
                      html={bodyHtml.get(indexOf.get(f)!) ?? ""}
                      prUrl={pr.url}
                      defaultOpen
                    />
                  ))}
                </div>

                {lower.length > 0 && (
                  <LowerJudgements count={lower.length}>
                    <div className="flex flex-col gap-2 mt-2">
                      {lower.map((f) => (
                        <JudgementCard
                          key={`${f.path}:${f.line}:${indexOf.get(f)}`}
                          judgement={f}
                          html={bodyHtml.get(indexOf.get(f)!) ?? ""}
                          prUrl={pr.url}
                        />
                      ))}
                    </div>
                  </LowerJudgements>
                )}
              </>
            )}
          </section>

          {/* Walkthrough */}
          {result.walkthrough.length > 0 && (
            <section className="mb-10">
              <SectionLabel className="pb-2.5 mb-3.5 border-b border-border block">
                Walkthrough
              </SectionLabel>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {["Files", "Change summary"].map((h) => (
                        <th
                          key={h}
                          className="px-0 pr-4 pb-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.09em] text-text-dim"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.walkthrough.map((row, i) => (
                      <tr key={i} className="border-b border-border last:border-b-0">
                        <td className="pr-4 py-3 align-top w-2/5">
                          <div className="flex flex-col gap-1">
                            {row.files.map((f) => (
                              <code
                                key={f}
                                className="font-mono text-[11px] text-text-muted break-all"
                              >
                                {f}
                              </code>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 text-[13px] text-text leading-relaxed align-top">
                          {row.summary}
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
            <SectionLabel className="pb-2.5 mb-3.5 border-b border-border block">
              Summary
            </SectionLabel>
            <div className="bg-surface border border-border rounded-lg p-5">
              <div
                className="prose-dark"
                dangerouslySetInnerHTML={{ __html: renderMd(result.summary) }}
              />
            </div>
          </section>

          {/* Diagram */}
          {result.diagram && (
            <section className="mb-10">
              <SectionLabel className="pb-2.5 mb-3.5 border-b border-border block">
                Flow diagram
              </SectionLabel>
              <div className="bg-surface border border-border rounded-lg p-5 overflow-x-auto">
                <pre className="font-mono text-xs text-text-muted leading-relaxed">
                  {result.diagram}
                </pre>
              </div>
            </section>
          )}
        </main>
      </div>
    </>
  );
}
