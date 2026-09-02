import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pc from "picocolors";

import { parsePRRef, ReviewRecordSchema } from "@komodo/core";

import { RemoteKomodo, resolveTarget } from "../remote.js";

/**
 * Put a review that was produced here into a team's queue.
 *
 * Current-branch mode ends with a record on this machine and a queue nobody
 * else can see. That is right for one person reviewing their own branch and
 * useless the moment a team is involved: the whole point of a shared queue is
 * that the answers land where the next person will look.
 *
 * Unlike `submit` there is no claim and no lease, because there was never a
 * job — what stands in for it is that the deployment already knows the pull
 * request, at the head this review read. A record for a commit the poller has
 * never seen is refused there, not here.
 */
export async function pushCommand(
  recordPath: string,
  opts: { pr?: string; host?: string; apiKey?: string },
): Promise<void> {
  const record = ReviewRecordSchema.parse(
    JSON.parse(readFileSync(resolve(recordPath), "utf8")),
  );

  const target = resolveTarget(opts);
  if (target.kind === "local") {
    throw new Error(
      "Which deployment? Pass --host <url>, or run `komodo-review login` once. A local queue already has this review — `komodo-review dev` opens it.",
    );
  }

  const prId = resolvePrId(record, opts.pr);
  const pushed = await new RemoteKomodo(target.host, target.apiKey).submitDirect(
    prId,
    record,
  );

  console.log(pc.green(`Pushed ${prId}: ${pushed.reviewId}`));
  if (pushed.url) console.log(pushed.url);
}

/**
 * Which pull request this review belongs to.
 *
 * A record built from a local branch carries no pull request number — the diff
 * source had none to give — so the caller names one. A record built from a real
 * pull request already knows, and asking again would be asking twice.
 */
function resolvePrId(
  record: { pr: { owner: string; repo: string; number: number } },
  named: string | undefined,
): string {
  if (named) {
    const ref = parsePRRef(named);
    return `${ref.owner}/${ref.repo}#${ref.number}`;
  }
  if (!record.pr.number) {
    throw new Error(
      "This record was built from a local branch and names no pull request. Pass --pr owner/repo#123.",
    );
  }
  return `${record.pr.owner}/${record.pr.repo}#${record.pr.number}`;
}
