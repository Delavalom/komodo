"use server";

/**
 * Write seam's server half.
 *
 * A shared queue cannot be mutated in a browser's localStorage, so every write
 * against a store-owned entity is a server action: it goes through the port
 * and then revalidates, and the next render picks the change up for everyone
 * rather than for one tab.
 *
 * The hooks in lib/data/mutations.ts wrap these, so callers did not move.
 */
import { revalidatePath } from "next/cache";

import { getStore } from "@/lib/data/server";

export async function setRepoEnabled(
  repoId: string,
  enabled: boolean,
): Promise<void> {
  await (await getStore()).setRepoEnabled(repoId, enabled);
  revalidatePath("/", "layout");
}

export async function retriggerReviews(judgmentIds: string[]): Promise<void> {
  await (await getStore()).retriggerReviews(judgmentIds);
  revalidatePath("/", "layout");
}

export async function inviteMember(email: string): Promise<void> {
  const store = await getStore();
  const { members } = await store.snapshot();
  if (members.some((m) => m.email === email)) return;

  // The roster is keyed on the GitHub login, and an invite only carries an
  // email. The local part is the best guess available until they connect an
  // account; the settings screen is where it gets corrected.
  const login = email.split("@")[0];
  await store.saveMember({
    email,
    name: login,
    githubLogin: login,
    role: "member",
    avatarSeed: email,
    isYou: false,
  });
  revalidatePath("/", "layout");
}

export async function removeMember(memberId: string): Promise<void> {
  await (await getStore()).removeMember(memberId);
  revalidatePath("/", "layout");
}
