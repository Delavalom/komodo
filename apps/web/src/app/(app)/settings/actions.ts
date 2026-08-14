"use server";

import { auth } from "@/auth";
import { MODELS } from "@/lib/models";
import { saveUserSettings, type ReviewProfile, type Settings } from "@/lib/settings";

const PROFILES: ReviewProfile[] = ["quiet", "chill", "assertive"];

/** Persist review defaults. Values are re-validated here — the client is not trusted. */
export async function updateSettings(
  settings: Settings,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in" };

  if (!MODELS.some((m) => m.id === settings.defaultModel)) {
    return { ok: false, error: "Unknown model" };
  }
  if (!PROFILES.includes(settings.reviewProfile)) {
    return { ok: false, error: "Unknown review profile" };
  }

  try {
    await saveUserSettings(session.user.id, {
      defaultModel: settings.defaultModel,
      reviewProfile: settings.reviewProfile,
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not save settings" };
  }
}
