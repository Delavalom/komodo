import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDb, reviews, creditLedger } from "@/db";
import { eq, desc, sum, count, max, avg } from "drizzle-orm";

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

function ConfidenceMeter({ value, max: maxVal = 5 }: { value: number | null; max?: number }) {
  const pct = value != null ? (value / maxVal) * 100 : 0;
  const color = value == null ? "#1E2128" : value >= 4 ? "#3ECF8E" : value >= 2 ? "#EAB308" : "#EF4444";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 rounded-full overflow-hidden" style={{ height: 4, backgroundColor: "#1E2128" }}>
        <div style={{ width: `${pct}%`, backgroundColor: color, height: "100%" }} />
      </div>
      <span className="text-xs" style={{ color: "#9CA3AF" }}>
        {value ?? "—"}/{maxVal}
      </span>
    </div>
  );
}

function ModelLabel({ model }: { model: string | null }) {
  if (!model) return <span style={{ color: "#6B7280" }}>—</span>;
  const short =
    model.includes("/") ? model.split("/")[1] : model;
  return (
    <span className="text-xs font-mono" style={{ color: "#9CA3AF" }}>
      {short}
    </span>
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

    db.select({ total: sum(creditLedger.delta) }).from(creditLedger).where(eq(creditLedger.userId, userId)),

    db
      .select({
        totalReviews: count(reviews.id),
        criticalCaught: count(reviews.id),
        avgConfidence: avg(reviews.confidence),
      })
      .from(reviews)
      .where(eq(reviews.userId, userId)),
  ]);

  const balance = Number(balanceRows[0]?.total ?? 0);
  const totalReviews = Number(stats[0]?.totalReviews ?? 0);
  const avgConf = stats[0]?.avgConfidence ? Number(stats[0].avgConfidence).toFixed(1) : "—";

  const criticalCount = userReviews.reduce((acc, r) => {
    const rec = r.record;
    if (!rec) return acc;
    return acc + rec.result.findings.filter((f) => f.severity === "critical").length;
  }, 0);

  return (
    <div>
      {/* KPI stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total reviews", value: totalReviews },
          { label: "Critical bugs caught", value: criticalCount },
          { label: "Avg confidence", value: `${avgConf}/5` },
          { label: "Credits balance", value: balance.toLocaleString() },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="rounded-xl p-4"
            style={{ backgroundColor: "#111318", border: "1px solid #1E2128" }}
          >
            <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#6B7280" }}>
              {label}
            </div>
            <div className="text-2xl font-bold" style={{ color: "#E5E7EB" }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Reviews table */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #1E2128" }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #1E2128" }}>
          <h2 className="text-sm font-semibold" style={{ color: "#E5E7EB" }}>
            Recent reviews
          </h2>
          <a
            href="/new"
            className="text-xs px-3 py-1.5 rounded-lg font-medium"
            style={{ backgroundColor: "#3ECF8E", color: "#0A0B0D" }}
          >
            + New review
          </a>
        </div>

        {userReviews.length === 0 ? (
          <div className="text-center py-16" style={{ color: "#4B5563" }}>
            <div className="text-3xl mb-3">🦎</div>
            <p className="text-sm">No reviews yet.</p>
            <a href="/new" className="text-sm mt-2 inline-block" style={{ color: "#3ECF8E" }}>
              Run your first review →
            </a>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid #1E2128", backgroundColor: "#0D0F12" }}>
                {["PR", "Repo", "Model", "Confidence", "Findings", "When"].map((h) => (
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
              {userReviews.map((r) => (
                <tr
                  key={r.id}
                  style={{ borderBottom: "1px solid #161A22" }}
                  className="hover:bg-[#111318] transition-colors"
                >
                  <td className="px-4 py-3">
                    <a href={`/reviews/${r.id}`} className="hover:underline" style={{ color: "#3ECF8E" }}>
                      #{r.number} {r.title.length > 40 ? r.title.slice(0, 40) + "…" : r.title}
                    </a>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: "#9CA3AF" }}>
                    {r.owner}/{r.repo}
                  </td>
                  <td className="px-4 py-3">
                    <ModelLabel model={r.model} />
                  </td>
                  <td className="px-4 py-3">
                    <ConfidenceMeter value={r.confidence} />
                  </td>
                  <td className="px-4 py-3 text-center" style={{ color: "#9CA3AF" }}>
                    {r.findingsCount}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: "#6B7280" }}>
                    {formatRelativeTime(new Date(r.createdAt))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
