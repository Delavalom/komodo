import "server-only";

/**
 * Who is acting on this device.
 *
 * Komodo has no authentication — a self-hosted deployment is a trusted
 * network, and the README says so. But "no authentication" was being read as
 * "one identity": every answer and every vote was attributed to komodo.yaml's
 * `team.you`, so on a shared deployment the decision ledger recorded that one
 * person had decided everything. The ledger is the thing this product exists
 * to keep, and one that cannot say who decided is not much of a record.
 *
 * So: a cookie naming which member of the roster you are. It is a per-device
 * preference, not a credential — anyone who can reach the queue can set it to
 * anyone, exactly as they could before. What it buys is that a team of four
 * sharing a deployment gets four names in the ledger instead of one, which is
 * the difference between a record and a rubber stamp.
 *
 * When real authentication arrives it replaces this function and nothing else:
 * the rule for turning a login into a member lives in @komodo/store, and only
 * the way the login is obtained changes.
 */
import { cookies } from "next/headers";

import { pickActor } from "@komodo/store";
import type { Member } from "@/lib/types";

export const ACTOR_COOKIE = "komodo_actor";

/**
 * The roster member acting on this request.
 *
 * Falls back to `team.you` — the member komodo.yaml marks — so a fresh browser
 * behaves exactly as the deployment did before, and a single-person install
 * never has to choose anything.
 */
export async function resolveActor(members: Member[]): Promise<Member | null> {
  return pickActor(members, (await cookies()).get(ACTOR_COOKIE)?.value);
}

/** The login to record, for a store that keys attribution on it. */
export async function resolveActorLogin(members: Member[]): Promise<string> {
  return (await resolveActor(members))?.githubLogin ?? "unknown";
}
