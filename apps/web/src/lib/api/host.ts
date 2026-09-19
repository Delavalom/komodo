import "server-only";

/**
 * What this deployment calls itself.
 *
 * A claim names the host an agent should submit its review back to, and that
 * name is written to a file on the agent's machine and later handed a working
 * API key. So it cannot come from the request.
 *
 * It used to. `X-Forwarded-Host` was trusted on the argument that the value is
 * "only ever echoed back to the caller that sent it" — which was wrong: the
 * caller writes it to `.komodo/claims/<job>.json` and `komodo-review submit`
 * posts a credential to whatever it says. One forged header on a claim call was
 * a credential redirect, and the same value goes into the URL the skill tells an
 * agent to hand its user.
 *
 * So the operator says, and nothing else does. `local.url` in komodo.yaml is
 * the field the README already tells them to point at the real hostname for
 * review receipts; this is the same fact, so it is the same field. The request's
 * own host is the fallback, which is right for `komodo dev` on a laptop and is
 * why a deployment behind a proxy has to set `local.url`.
 */
import { loadConfig } from "@komodo/core";

export function deploymentUrl(request: Request): string {
  const configured = configuredUrl();
  if (configured) return configured;

  // Deliberately `url.host` and not the forwarded header. Behind a proxy this
  // is the internal address, which is wrong — and set `local.url` is a fix an
  // operator can make, where "somebody forged a header" is not.
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function configuredUrl(): string | null {
  const fromEnv = process.env.KOMODO_PUBLIC_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  try {
    // KOMODO_CONFIG_DIR is set by the CLI that spawned this server; without it
    // loadConfig searches the standalone bundle's own directory, where no
    // komodo.yaml has ever been. Same reason postReceipt reads it that way.
    const { config } = loadConfig(process.env.KOMODO_CONFIG_DIR || process.cwd());
    const url = config.local.url?.trim();
    // The packaged default is a localhost address, which is the honest answer
    // for a laptop and a wrong one for a deployment nobody configured — but it
    // is no more wrong than the request host, and it is what receipts already
    // link at, so the two agree.
    return url ? url.replace(/\/+$/, "") : null;
  } catch {
    return null;
  }
}
