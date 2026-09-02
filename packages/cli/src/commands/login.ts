import { rmSync } from "node:fs";
import pc from "picocolors";

import { normalizeHost } from "@komodo/core";

import { credentialsPath, RemoteKomodo, writeCredentials } from "../remote.js";

/**
 * Point this machine at a Komodo deployment.
 *
 * Saved rather than passed every time because the caller that needs it most is
 * an agent following a skill, and a flag it has to remember is a flag it will
 * eventually get wrong — worse, a key on a command line ends up in shell
 * history and in the transcript. One file, once, with the permissions a
 * credential deserves.
 *
 * This is not a login in the sense the rest of Komodo avoids: no account is
 * created and no password is brokered. It stores a key somebody minted in the
 * queue's own settings screen, and checks that it works before saving it —
 * finding out at claim time that the key was pasted with a trailing newline is
 * the failure this call exists to move forward.
 */
export async function loginCommand(opts: {
  host?: string;
  apiKey?: string;
  forget?: boolean;
}): Promise<void> {
  if (opts.forget) {
    try {
      rmSync(credentialsPath());
      console.log(`Forgot ${credentialsPath()}`);
    } catch {
      console.log(pc.dim("Nothing saved to forget."));
    }
    return;
  }

  if (!opts.host) throw new Error("Which deployment? Pass --host <url>.");
  const apiKey = opts.apiKey ?? process.env.KOMODO_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Pass --api-key <key>, or set KOMODO_API_KEY. Mint one under Settings → API Keys in the queue.",
    );
  }

  const host = normalizeHost(opts.host);
  const queue = await new RemoteKomodo(host, apiKey.trim()).check();

  const path = writeCredentials({ host, apiKey: apiKey.trim() });
  console.log(
    pc.green(
      `Connected to ${queue.organization.name} at ${host} (${queue.repositories.length} repositories).`,
    ),
  );
  console.log(path);
}
