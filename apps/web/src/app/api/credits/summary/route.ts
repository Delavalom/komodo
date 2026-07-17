import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, creditLedger } from "@/db";
import { getBalance } from "@/lib/credits";
import { POLAR_ENABLED as polarEnabled } from "@/lib/polar";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const userId = session.user.id;

  const [balance, ledger] = await Promise.all([
    getBalance(userId),
    db
      .select()
      .from(creditLedger)
      .where(eq(creditLedger.userId, userId))
      .orderBy(desc(creditLedger.createdAt))
      .limit(100),
  ]);

  return NextResponse.json({
    balance,
    ledger,
    polarEnabled,
    devTopupEnabled: process.env.DEV_TOPUP_ENABLED === "true",
  });
}
