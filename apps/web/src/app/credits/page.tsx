import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, creditLedger } from "@/db";
import { getBalance } from "@/lib/credits";
import { PageBody, PageHeader } from "@/components/shell/PageHeader";
import { SectionLabel } from "@/components/ui";
import { BuyCredits } from "./buy-credits";

const REASON_LABEL: Record<string, string> = {
  welcome: "Welcome bonus",
  review: "Review",
  purchase: "Purchase",
  "dev-topup": "Dev top-up",
};

export default async function CreditsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const userId = session.user.id;
  const db = getDb();

  const [balance, ledger] = await Promise.all([
    getBalance(userId),
    db
      .select()
      .from(creditLedger)
      .where(eq(creditLedger.userId, userId))
      .orderBy(desc(creditLedger.createdAt))
      .limit(100),
  ]);

  const polarEnabled = Boolean(process.env.POLAR_ACCESS_TOKEN);
  const devTopupEnabled = process.env.DEV_TOPUP_ENABLED === "true";

  const spent = ledger.filter((r) => r.delta < 0).reduce((a, r) => a + Math.abs(r.delta), 0);
  const purchased = ledger.filter((r) => r.delta > 0).reduce((a, r) => a + r.delta, 0);

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Komodo", href: "/" },
          { label: "Account" },
          { label: "Credits" },
        ]}
      />

      <PageBody width="narrow">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-text tracking-tight">Credits</h1>
          <p className="text-sm text-text-dim mt-1">
            1 credit = $0.01. Reviews are charged at 1.5× the underlying model cost.
          </p>
        </div>

        {/* Balance */}
        <div className="bg-surface border border-border rounded-xl p-6 mb-6">
          <SectionLabel className="mb-2">Current balance</SectionLabel>
          <div className="text-4xl font-bold text-accent tabular-nums leading-none">
            {balance.toLocaleString()}
            <span className="text-xl font-normal text-text-dim ml-2">credits</span>
          </div>
          <div className="flex gap-6 mt-4 pt-4 border-t border-border text-xs text-text-dim">
            <span>
              Added:{" "}
              <strong className="font-medium text-text tabular-nums">
                {purchased.toLocaleString()}
              </strong>
            </span>
            <span>
              Spent:{" "}
              <strong className="font-medium text-text tabular-nums">
                {spent.toLocaleString()}
              </strong>
            </span>
          </div>
        </div>

        <BuyCredits polarEnabled={polarEnabled} devTopupEnabled={devTopupEnabled} />

        {/* Ledger */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden mt-6">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold text-text">Transaction history</h2>
          </div>

          {ledger.length === 0 ? (
            <p className="py-10 text-center text-sm text-text-faint">No transactions yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-elevated">
                    {["When", "Reason", "Credits"].map((h) => (
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
                  {ledger.map((row) => (
                    <tr key={row.id} className="border-b border-border last:border-b-0">
                      <td className="px-4 py-2.5 text-xs text-text-dim whitespace-nowrap">
                        {new Date(row.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-text-muted">
                        {REASON_LABEL[row.reason] ?? row.reason}
                        {row.ref && (
                          <span className="ml-2 font-mono text-text-faint">
                            {row.ref.slice(0, 12)}…
                          </span>
                        )}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-sm font-semibold tabular-nums ${
                          row.delta > 0 ? "text-accent" : "text-critical"
                        }`}
                      >
                        {row.delta > 0 ? "+" : ""}
                        {row.delta}
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
