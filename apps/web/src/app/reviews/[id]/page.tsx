import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, reviews } from "@/db";
import { marked } from "marked";
import { Collapsible } from "./collapsible";
import type { Finding } from "@komodo/core";

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#EF4444",
  major: "#F97316",
  minor: "#EAB308",
  trivial: "#3B82F6",
};

const SEVERITY_BG: Record<string, string> = {
  critical: "#1A0808",
  major: "#1A0F08",
  minor: "#1A1808",
  trivial: "#08101A",
};

function SeverityChip({ severity }: { severity: string }) {
  return (
    <span
      className="text-xs font-semibold px-2 py-0.5 rounded uppercase tracking-wider"
      style={{ color: SEVERITY_COLOR[severity] ?? "#9CA3AF", backgroundColor: SEVERITY_BG[severity] ?? "#111318" }}
    >
      {severity}
    </span>
  );
}

function CategoryChip({ category }: { category: string }) {
  return (
    <span
      className="text-xs px-2 py-0.5 rounded"
      style={{ color: "#9CA3AF", backgroundColor: "#1E2128" }}
    >
      {category}
    </span>
  );
}

function ConfidenceMeterLarge({ value }: { value: number }) {
  const pct = (value / 5) * 100;
  const color = value >= 4 ? "#3ECF8E" : value >= 2 ? "#EAB308" : "#EF4444";
  return (
    <div className="flex items-center gap-3">
      <div className="text-5xl font-bold" style={{ color }}>
        {value}
      </div>
      <div>
        <div className="text-sm mb-1" style={{ color: "#6B7280" }}>
          / 5 confidence
        </div>
        <div className="rounded-full overflow-hidden" style={{ width: 120, height: 6, backgroundColor: "#1E2128" }}>
          <div style={{ width: `${pct}%`, backgroundColor: color, height: "100%", borderRadius: "9999px" }} />
        </div>
      </div>
    </div>
  );
}

function renderMd(md: string): string {
  return marked(md) as string;
}

function FindingCard({ finding, prUrl }: { finding: Finding; prUrl: string }) {
  const ghFileUrl = `${prUrl}/files`;
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: `1px solid ${SEVERITY_COLOR[finding.severity]}33` }}
    >
      <div
        className="px-4 py-3 flex flex-wrap items-center gap-2"
        style={{ backgroundColor: SEVERITY_BG[finding.severity] ?? "#111318", borderBottom: "1px solid #1E2128" }}
      >
        <SeverityChip severity={finding.severity} />
        <CategoryChip category={finding.category} />
        <span className="text-sm font-medium ml-1" style={{ color: "#E5E7EB" }}>
          {finding.title}
        </span>
        <a
          href={ghFileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-xs font-mono"
          style={{ color: "#6B7280" }}
        >
          {finding.path}:{finding.line}
          {finding.endLine ? `–${finding.endLine}` : ""}
        </a>
      </div>

      <div className="p-4 space-y-3" style={{ backgroundColor: "#0D0F12" }}>
        <div
          className="prose-dark text-sm"
          dangerouslySetInnerHTML={{ __html: renderMd(finding.body) }}
        />

        {finding.suggestion && (
          <div>
            <div className="text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: "#6B7280" }}>
              Suggestion
            </div>
            <pre
              className="text-xs overflow-x-auto p-3 rounded-lg font-mono"
              style={{ backgroundColor: "#111318", border: "1px solid #1E2128", color: "#3ECF8E" }}
            >
              {finding.suggestion}
            </pre>
          </div>
        )}

        <Collapsible label="Fix prompt">
          <pre
            className="text-xs whitespace-pre-wrap font-mono"
            style={{ color: "#9CA3AF" }}
          >
            {finding.fixPrompt}
          </pre>
        </Collapsible>
      </div>
    </div>
  );
}

export default async function ReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const { id } = await params;
  const db = getDb();
  const [review] = await db.select().from(reviews).where(eq(reviews.id, id)).limit(1);

  if (!review || review.userId !== session.user.id) notFound();

  const record = review.record!;
  const result = record.result;
  const modelShort = review.model?.includes("/") ? review.model.split("/")[1] : (review.model ?? "—");

  const sortedFindings = [...result.findings].sort((a, b) => {
    const rank = { critical: 4, major: 3, minor: 2, trivial: 1 };
    return (rank[b.severity as keyof typeof rank] ?? 0) - (rank[a.severity as keyof typeof rank] ?? 0);
  });

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1 text-sm" style={{ color: "#6B7280" }}>
          <a href="/" style={{ color: "#6B7280" }}>
            Dashboard
          </a>
          <span>/</span>
          <span style={{ color: "#9CA3AF" }}>
            {review.owner}/{review.repo}#{review.number}
          </span>
        </div>
        <h1 className="text-xl font-bold" style={{ color: "#E5E7EB" }}>
          {record.pr.title}
        </h1>
        <div className="flex flex-wrap gap-3 mt-2">
          <a
            href={record.pr.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs"
            style={{ color: "#3ECF8E" }}
          >
            View on GitHub →
          </a>
          <span className="text-xs" style={{ color: "#6B7280" }}>
            {new Date(review.createdAt).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Verdict card */}
      <div className="rounded-xl p-6" style={{ backgroundColor: "#111318", border: "1px solid #1E2128" }}>
        <div className="flex flex-wrap items-start gap-6">
          <ConfidenceMeterLarge value={result.confidence} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium mb-3" style={{ color: "#E5E7EB" }}>
              {result.verdict}
            </p>
            <div className="flex flex-wrap gap-4 text-xs" style={{ color: "#6B7280" }}>
              <span>
                Effort: <span style={{ color: "#9CA3AF" }}>{result.effort}/5</span>
              </span>
              <span>
                Model: <span className="font-mono" style={{ color: "#9CA3AF" }}>{modelShort}</span>
              </span>
              <span>
                Cost: <span style={{ color: "#9CA3AF" }}>${Number(review.costUsd ?? 0).toFixed(4)}</span>
              </span>
              <span>
                Credits: <span style={{ color: "#9CA3AF" }}>{review.creditsCharged}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="rounded-xl p-5" style={{ backgroundColor: "#111318", border: "1px solid #1E2128" }}>
        <h2 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "#6B7280" }}>
          Summary
        </h2>
        <div className="prose-dark text-sm" dangerouslySetInnerHTML={{ __html: renderMd(result.summary) }} />
      </div>

      {/* Diagram */}
      {result.diagram && (
        <div className="rounded-xl p-5" style={{ backgroundColor: "#111318", border: "1px solid #1E2128" }}>
          <h2 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "#6B7280" }}>
            Flow diagram
          </h2>
          <pre className="text-xs overflow-x-auto font-mono" style={{ color: "#9CA3AF" }}>
            {result.diagram}
          </pre>
        </div>
      )}

      {/* Walkthrough */}
      {result.walkthrough.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #1E2128" }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid #1E2128" }}>
            <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#6B7280" }}>
              Walkthrough
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid #1E2128", backgroundColor: "#0D0F12" }}>
                {["Files", "Summary"].map((h) => (
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
              {result.walkthrough.map((row, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #161A22" }}>
                  <td className="px-4 py-2.5 align-top w-48">
                    <div className="flex flex-col gap-1">
                      {row.files.map((f) => (
                        <span key={f} className="text-xs font-mono truncate max-w-[180px]" style={{ color: "#6B7280" }}>
                          {f}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-sm" style={{ color: "#9CA3AF" }}>
                    {row.summary}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Files strip */}
      {record.files.length > 0 && (
        <div className="rounded-xl p-4" style={{ backgroundColor: "#111318", border: "1px solid #1E2128" }}>
          <h2 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "#6B7280" }}>
            Files ({record.files.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {record.files.map((f) => (
              <span
                key={f.path}
                className="text-xs font-mono px-2 py-1 rounded"
                style={{ backgroundColor: "#1E2128", color: "#9CA3AF" }}
              >
                {f.path}
                <span className="ml-1.5 text-[10px]" style={{ color: "#4B5563" }}>
                  +{f.additions} -{f.deletions}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Findings */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "#6B7280" }}>
          Findings ({sortedFindings.length})
        </h2>
        {sortedFindings.length === 0 ? (
          <div
            className="rounded-xl p-8 text-center text-sm"
            style={{ backgroundColor: "#111318", border: "1px solid #1E2128", color: "#4B5563" }}
          >
            No findings — this PR looks clean!
          </div>
        ) : (
          <div className="space-y-4">
            {sortedFindings.map((f, i) => (
              <FindingCard key={i} finding={f} prUrl={record.pr.url} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
