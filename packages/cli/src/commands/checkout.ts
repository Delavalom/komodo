import { resolve } from "node:path";
import pc from "picocolors";

import { checkoutClaim } from "../checkout.js";
import { claimOutput, readClaimFile } from "../claim-file.js";

/** Check out a claim's head in this directory: after a refusal, or to resume a claim. */
export async function checkoutCommand(claimPath: string, opts: { json?: boolean }): Promise<void> {
  const path = resolve(claimPath);
  const claim = readClaimFile(path);
  checkoutClaim(claim, path);

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(claimOutput(path, claim, true))}\n`);
    return;
  }
  console.log(
    pc.green(`Checked out ${claim.headSha.slice(0, 12)} for ${claim.repoId}#${claim.number}.`),
  );
}
