import { createHmac, timingSafeEqual } from "crypto";

export const POLAR_ENABLED = !!(
  process.env.POLAR_ACCESS_TOKEN &&
  process.env.POLAR_PRODUCT_500 &&
  process.env.POLAR_PRODUCT_2000 &&
  process.env.POLAR_PRODUCT_10000
);

export const CREDIT_PACKS = [
  {
    credits: 500,
    label: "500 credits",
    price: "$5",
    productEnvKey: "POLAR_PRODUCT_500" as const,
    description: "Good for ~30 reviews",
  },
  {
    credits: 2000,
    label: "2,000 credits",
    price: "$18",
    productEnvKey: "POLAR_PRODUCT_2000" as const,
    description: "Good for ~130 reviews",
  },
  {
    credits: 10000,
    label: "10,000 credits",
    price: "$80",
    productEnvKey: "POLAR_PRODUCT_10000" as const,
    description: "Good for ~650 reviews",
  },
] as const;

export type CreditPackKey = (typeof CREDIT_PACKS)[number]["productEnvKey"];

export function getProductId(envKey: CreditPackKey): string | undefined {
  return process.env[envKey];
}

export function getCreditsByProductId(productId: string): number | null {
  for (const pack of CREDIT_PACKS) {
    const id = process.env[pack.productEnvKey];
    if (id === productId) return pack.credits;
  }
  return null;
}

/**
 * Verify a Polar (svix-delivered) webhook signature.
 * Header format: webhook-id, webhook-timestamp, webhook-signature (v1,base64...)
 */
export function verifyPolarWebhook(
  body: string,
  webhookId: string,
  webhookTimestamp: string,
  webhookSignature: string,
  secret: string,
): boolean {
  try {
    const signContent = `${webhookId}.${webhookTimestamp}.${body}`;
    // Polar uses base64url-decoded secret for HMAC
    const secretBytes = Buffer.from(secret.replace("whsec_", ""), "base64");
    const hmac = createHmac("sha256", secretBytes).update(signContent).digest("base64");
    const expected = `v1,${hmac}`;
    // webhook-signature may have multiple space-separated values
    const sigs = webhookSignature.split(" ");
    return sigs.some((sig) => {
      try {
        return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}
