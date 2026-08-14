import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, reviews } from "@/db";
import { modelLabel } from "@/lib/models";
import { PageBody, PageHeader } from "@/components/shell/PageHeader";
import { EmptyState, LinkButton, SEVERITY_COLOR, SEVERITY_ORDER, StatCard } from "@komodo/ui";
import { ChartCard, BarList, ColumnChart, NoData } from "./charts";
import type { BarDatum, ColumnDatum } from "./charts";

const DAYS = 30;

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const db = getDb();
  const rows = await db
    .select()
    .from(reviews)
    .where(eq(reviews.userId, session.user.id))
    .orderBy(desc(reviews.createdAt))
    .limit(500);

  if (rows.length === 0) {
    return (
      <>
        <PageHeader crumbs={[{ label: "Komodo", href: "/" }, { label: "Analytics" }]} />
        <PageBody>
          <div className="bg-surface border border-border rounded-xl">
            <EmptyState
              title="Nothing to chart yet"
              description="Analytics appear once you have run at least one review."
              action={
                <LinkButton href="/new" variant="primary" size="sm">
                  Run a review
                </LinkButton>
              }
            />
          </div>
        </PageBody>
      </>
    );
  }

  // ---- Reviews per day over the trailing window ----
  const perDay = new Map<string, number>();
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    perDay.set(dayKey(d), 0);
  }

  // ---- Aggregates ----
  const severityCounts: Record<string, number> = {};
  const modelCounts = new Map<string, number>();
  const confidenceBuckets = [0, 0, 0, 0, 0]; // index 0 => score 1
  let totalJudgements = 0;
  let totalCredits = 0;
  let totalCost = 0;
  let confidenceSum = 0;
  let confidenceN = 0;

  for (const r of rows) {
    const key = dayKey(new Date(r.createdAt));
    if (perDay.has(key)) perDay.set(key, (perDay.get(key) ?? 0) + 1);

    for (const f of r.record?.result.judgements ?? []) {
      severityCounts[f.severity] = (severityCounts[f.severity] ?? 0) + 1;
      totalJudgements++;
    }

    if (r.model) modelCounts.set(r.model, (modelCounts.get(r.model) ?? 0) + 1);

    if (r.confidence != null && r.confidence >= 1 && r.confidence <= 5) {
      confidenceBuckets[r.confidence - 1]++;
      confidenceSum += r.confidence;
      confidenceN++;
    }

    totalCredits += r.creditsCharged;
    totalCost += Number(r.costUsd ?? 0);
  }

  const perDayData: ColumnDatum[] = [...perDay.entries()].map(([iso, count]) => {
    const d = new Date(`${iso}T00:00:00Z`);
    return {
      label: String(d.getUTCDate()),
      value: count,
      title: d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" }),
    };
  });

  const severityData: BarDatum[] = SEVERITY_ORDER.map((s) => ({
    label: s.charAt(0).toUpperCase() + s.slice(1),
    value: severityCounts[s] ?? 0,
    color: SEVERITY_COLOR[s],
  })).filter((d) => d.value > 0);

  const modelData: BarDatum[] = [...modelCounts.entries()]
    .map(([id, count]) => ({ label: modelLabel(id), value: count }))
    .sort((a, b) => b.value - a.value);

  const confidenceData: ColumnDatum[] = confidenceBuckets.map((count, i) => ({
    label: String(i + 1),
    value: count,
    title: `Confidence ${i + 1}/5`,
  }));

  const avgConfidence = confidenceN > 0 ? (confidenceSum / confidenceN).toFixed(1) : null;
  const avgJudgements = rows.length > 0 ? (totalJudgements / rows.length).toFixed(1) : null;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Komodo", href: "/" }, { label: "Analytics" }]}
        actions={
          <span className="text-xs text-text-dim">
            Last {DAYS} days · {rows.length} reviews
          </span>
        }
      />

      <PageBody>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <StatCard label="Reviews" value={rows.length} />
          <StatCard label="Judgements" value={totalJudgements || null} hint={avgJudgements ? `${avgJudgements} per review` : undefined} />
          <StatCard label="Avg confidence" value={avgConfidence ? `${avgConfidence}/5` : null} />
          <StatCard
            label="Credits spent"
            value={totalCredits || null}
            hint={`$${totalCost.toFixed(2)} model cost`}
            accent
          />
        </div>

        <div className="grid gap-4">
          <ChartCard title="Reviews per day" subtitle={`Trailing ${DAYS} days`}>
            <ColumnChart data={perDayData} />
          </ChartCard>

          <div className="grid lg:grid-cols-2 gap-4">
            <ChartCard
              title="Judgements by severity"
              subtitle="Across all reviews"
            >
              {severityData.length > 0 ? <BarList data={severityData} /> : <NoData />}
            </ChartCard>

            <ChartCard title="Model usage" subtitle="Reviews run per model">
              {modelData.length > 0 ? <BarList data={modelData} /> : <NoData />}
            </ChartCard>
          </div>

          <ChartCard
            title="Confidence distribution"
            subtitle="How many reviews landed at each confidence score"
          >
            <ColumnChart data={confidenceData} />
          </ChartCard>
        </div>
      </PageBody>
    </>
  );
}
