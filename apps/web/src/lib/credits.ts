import { eq, sum } from "drizzle-orm";
import { getDb, creditLedger } from "@/db";

export const MIN_REVIEW_BALANCE = 25;

export function calculateCreditsCharged(costUsd: number): number {
  return Math.max(1, Math.ceil(costUsd * 1.5 * 100));
}

export async function getBalance(userId: string): Promise<number> {
  const db = getDb();
  const result = await db
    .select({ total: sum(creditLedger.delta) })
    .from(creditLedger)
    .where(eq(creditLedger.userId, userId));
  return Number(result[0]?.total ?? 0);
}

export async function deductCredits(
  userId: string,
  credits: number,
  reason: string,
  ref: string | null,
): Promise<void> {
  const db = getDb();
  await db.insert(creditLedger).values({
    userId,
    delta: -credits,
    reason,
    ref,
  });
}

export async function addCredits(
  userId: string,
  credits: number,
  reason: string,
  ref: string | null,
): Promise<void> {
  const db = getDb();
  await db.insert(creditLedger).values({
    userId,
    delta: credits,
    reason,
    ref,
  });
}
