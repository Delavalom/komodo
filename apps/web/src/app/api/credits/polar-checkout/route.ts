import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { POLAR_ENABLED, CREDIT_PACKS, getProductId, type CreditPackKey } from "@/lib/polar";

export async function POST(req: NextRequest) {
  if (!POLAR_ENABLED) {
    return NextResponse.json({ error: "Polar billing not configured" }, { status: 503 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const packKey = body?.pack as CreditPackKey | undefined;

  const validKeys = CREDIT_PACKS.map((p) => p.productEnvKey);
  if (!packKey || !validKeys.includes(packKey)) {
    return NextResponse.json({ error: "Invalid pack" }, { status: 400 });
  }

  const productId = getProductId(packKey);
  if (!productId) {
    return NextResponse.json({ error: "Product not configured" }, { status: 503 });
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? `https://${req.headers.get("host")}`;
  const successUrl = `${baseUrl}/credits?success=true`;

  try {
    const { Polar } = await import("@polar-sh/sdk");
    const polar = new Polar({ accessToken: process.env.POLAR_ACCESS_TOKEN! });

    const checkout = await polar.checkouts.create({
      products: [productId],
      successUrl,
      metadata: { userId: session.user.id },
    } as Parameters<typeof polar.checkouts.create>[0]);

    return NextResponse.json({ url: (checkout as { url: string }).url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create checkout";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
