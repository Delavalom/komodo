import { NextRequest, NextResponse } from "next/server";
import { verifyPolarWebhook, getCreditsByProductId } from "@/lib/polar";
import { addCredits } from "@/lib/credits";

export async function POST(req: NextRequest) {
  const secret = process.env.POLAR_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 });
  }

  const body = await req.text();
  const webhookId = req.headers.get("webhook-id") ?? "";
  const webhookTimestamp = req.headers.get("webhook-timestamp") ?? "";
  const webhookSignature = req.headers.get("webhook-signature") ?? "";

  if (!verifyPolarWebhook(body, webhookId, webhookTimestamp, webhookSignature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { type: string; data: Record<string, unknown> };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (event.type === "order.paid") {
    const data = event.data;
    // Extract userId from checkout metadata (set during checkout creation)
    const metadata =
      (data.metadata as Record<string, unknown>) ??
      ((data.checkout as { metadata?: Record<string, unknown> } | undefined)?.metadata ?? {});
    const userId = metadata.userId as string | undefined;

    const productId =
      ((data.product as { id?: string } | undefined)?.id) ??
      ((data.productId as string) ?? "");

    const credits = productId ? getCreditsByProductId(productId) : null;
    const orderId = (data.id as string) ?? webhookId;

    if (userId && credits) {
      await addCredits(userId, credits, "polar-purchase", orderId);
    }
  }

  return NextResponse.json({ received: true });
}
