import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDb, reviews, creditLedger } from "@/db";
import { eq, desc, sum, count, avg } from "drizzle-orm";
import { FileText, Plus } from "lucide-react";
import { PageBody, PageHeader } from "@/components/shell/PageHeader";
import {
  ConfidenceMeter,
  EmptyState,
  LinkButton,
  SEVERITY_COLOR,
  StatCard,
  isSeverity,
} from "@/components/ui";

function formatRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

function shortModel(model: string | null): string {
  if (!model) return "—";
  return model.includes("/") ? model.split("/")[1] : model;
}

/** Per-severity counts with coloured dots — finding density at a glance. */
function SeverityDots({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts).filter(([, n]) => n > 0);
  if (entries.length === 0) {
    return <span className="text-xs text-text-faint">clean</span>;
  }
  return (
    <div className="flex items-center gap-2">
      {entries.map(([severity, n]) => (
        <span
          key={severity}
          title={`${n} ${severity}`}
          className="inline-flex items-center gap-1 text-[11px] tabular-nums"
          style={{ color: isSeverity(severity) ? SEVERITY_COLOR[severity] : undefined }}
        >
          <span className="inline-block size-1.5 rounded-full bg-current" />
          {n}
        </span>
      ))}
    </div>
  );
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const db = getDb();
  const userId = session.user.id;

  const [userReviews, balanceRows, stats] = await Promise.all([
    db
      .select()
      .from(reviews)
      .where(eq(reviews.userId, userId))
      .orderBy(desc(reviews.createdAt))
      .limit(50),

    db
      .select({ total: sum(creditLedger.delta) })
      .from(creditLedger)
      .where(eq(creditLedger.userId, userId)),

    db
      .select({
        totalReviews: count(reviews.id),
        avgConfidence: avg(reviews.confidence),
      })
      .from(reviews)
      .where(eq(reviews.userId, userId)),
  ]);

  const balance = Number(balanceRows[0]?.total ?? 0);
  const totalReviews = Number(stats[0]?.totalReviews ?? 0);
  const avgConf = stats[0]?.avgConfidence ? Number(stats[0].avgConfidence).toFixed(1) : null;

  // Per-review severity breakdown, computed once and reused by the table below.
  const severityByReview = new Map<string, Record<string, number>>();
  let criticalCount = 0;

  for (const r of userReviews) {
    const counts: Record<string, number> = {};
    for (const f of r.record?.result.findings ?? []) {
      counts[f.severity] = (counts[f.severity] ?? 0) + 1;
      if (f.severity === "critical") criticalCount++;
    }
    severityByReview.set(r.id, counts);
  }

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Komodo", href: "/" }, { label: "Reviews" }]}
        actions={
          <LinkButton href="/new" variant="primary" size="sm">
            <Plus size={14} />
            New review
          </LinkButton>
        }
      />

      <PageBody>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <StatCard label="Total reviews" value={totalReviews || null} />
          <StatCard label="Critical bugs caught" value={totalReviews ? criticalCount : null} />
          <StatCard label="Avg confidence" value={avgConf ? `${avgConf}/5` : null} />
          <StatCard label="Credits balance" value={balance.toLocaleString()} accent />
        </div>

        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold text-text">Recent reviews</h2>
          </div>

          {userReviews.length === 0 ? (
            <EmptyState
              icon={<FileText size={28} strokeWidth={1.5} />}
              title="No reviews yet"
              description="Paste a GitHub pull request URL and Komodo will review it with the model you pick."
              action={
                <LinkButton href="/new" variant="primary" size="sm">
                  <Plus size={14} />
                  Run your first review
                </LinkButton>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-elevated">
                    {["Pull request", "Model", "Confidence", "Findings", "When"].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.09em] text-text-faint whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {userReviews.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-border last:border-b-0 hover:bg-hover transition-colors"
                    >
                      <td className="px-4 py-3 max-w-md">
                        <a href={`/reviews/${r.id}`} className="block group">
                          <div className="text-[13px] font-medium text-text group-hover:text-accent transition-colors truncate">
                            {r.title}
                          </div>
                          <div className="text-[11px] font-mono text-text-faint mt-0.5">
                            {r.owner}/{r.repo}#{r.number}
                          </div>
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[11px] font-mono text-text-muted whitespace-nowrap">
                          {shortModel(r.model)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <ConfidenceMeter score={r.confidence} size="sm" />
                      </td>
                      <td className="px-4 py-3">
                        <SeverityDots counts={severityByReview.get(r.id) ?? {}} />
                      </td>
                      <td className="px-4 py-3 text-xs text-text-dim whitespace-nowrap">
                        {formatRelativeTime(new Date(r.createdAt))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </PageBody>
    </>
  );
}
