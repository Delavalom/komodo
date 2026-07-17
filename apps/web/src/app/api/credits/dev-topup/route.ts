import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { addCredits } from "@/lib/credits";

export async function POST() {
  if (process.env.DEV_TOPUP_ENABLED !== "true") {
    return NextResponse.json({ error: "Dev top-up is disabled" }, { status: 403 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await addCredits(session.user.id, 500, "dev-topup", null);
  return NextResponse.json({ added: 500 });
}
