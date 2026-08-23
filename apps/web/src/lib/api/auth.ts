import "server-only";

/**
 * Bearer-token authentication for the HTTP API.
 *
 * The one authenticated surface in Komodo. The queue itself has no auth — a
 * self-hosted deployment is a trusted network, and the README says so — but
 * an API key is a credential someone can paste into CI, which puts it outside
 * that perimeter and means it has to actually mean something.
 *
 * The secret is hashed and looked up; the plaintext is never compared against
 * anything stored, because nothing stored is the plaintext.
 */
import { hashApiKey } from "@komodo/store/api-key";
import type { ApiKey } from "@komodo/store";

import { getStore } from "@/lib/data/server";

export type AuthResult =
  | { ok: true; key: ApiKey }
  | { ok: false; status: 401; message: string };

export async function authenticate(request: Request): Promise<AuthResult> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) {
    return {
      ok: false,
      status: 401,
      message: "Send an API key as `Authorization: Bearer kmd_…`.",
    };
  }

  const key = await (await getStore()).findApiKeyByHash(hashApiKey(match[1].trim()));
  if (!key) {
    // Deliberately the same shape of answer as a malformed header: that a key
    // is well-formed but unknown is a fact worth withholding.
    return { ok: false, status: 401, message: "That API key is not valid." };
  }
  return { ok: true, key };
}

/** The JSON body for a rejected request. */
export function unauthorized(result: Extract<AuthResult, { ok: false }>) {
  return Response.json(
    { error: result.message },
    {
      status: result.status,
      headers: { "WWW-Authenticate": 'Bearer realm="komodo"' },
    },
  );
}
