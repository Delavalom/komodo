/**
 * Generating and hashing an API key.
 *
 * Here rather than in the web app because the hash is half of a storage
 * contract: the driver looks a key up by it, and if the two sides ever
 * disagreed about how a secret becomes a hash, every key would silently stop
 * working. One definition, used by whoever mints and whoever checks.
 *
 * The secret is 32 random bytes, base64url-encoded. It is returned once, from
 * `mintApiKey`, and never stored — `keyHash` is what the database holds, so a
 * copy of the database is not a set of working credentials.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Recognisable in a log or a config file, and greppable in a leak. */
const PREFIX = "kmd_";

/** Enough of the key to tell two apart in a list without being one. */
const VISIBLE = 8;

export interface MintedApiKey {
  /** Show this once. Nothing can produce it again. */
  secret: string;
  keyHash: string;
  prefix: string;
}

export function mintApiKey(): MintedApiKey {
  const secret = `${PREFIX}${randomBytes(32).toString("base64url")}`;
  return {
    secret,
    keyHash: hashApiKey(secret),
    prefix: secret.slice(0, PREFIX.length + VISIBLE),
  };
}

/**
 * SHA-256, hex.
 *
 * Deliberately not a password hash: the input is 32 bytes of CSPRNG output,
 * not something a person chose, so there is nothing for bcrypt's work factor
 * to defend against — and a slow hash on every API request would be a cost
 * with no matching benefit. What matters is that the stored form is not
 * usable as a credential, and a single round of SHA-256 gives that.
 */
export function hashApiKey(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/**
 * Constant-time comparison for two hex digests.
 *
 * The lookup itself is by hash and so does not compare secrets, but any code
 * that does compare should use this rather than `===`.
 */
export function apiKeyHashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}
