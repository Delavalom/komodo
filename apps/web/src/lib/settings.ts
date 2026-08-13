import "server-only";
import { eq } from "drizzle-orm";
import { getDb, userSettings } from "@/db";
import { DEFAULT_SETTINGS, isReviewProfile, type Settings } from "./settings-shared";

export type { ReviewProfile, Settings } from "./settings-shared";
export { DEFAULT_SETTINGS, REVIEW_PROFILES, isReviewProfile } from "./settings-shared";

/** Returns the user's saved settings, falling back to defaults if none exist yet. */
export async function getUserSettings(userId: string): Promise<Settings> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  if (!row) return DEFAULT_SETTINGS;

  return {
    defaultModel: row.defaultModel,
    postToGithubDefault: row.postToGithubDefault,
    reviewProfile: isReviewProfile(row.reviewProfile)
      ? row.reviewProfile
      : DEFAULT_SETTINGS.reviewProfile,
  };
}

export async function saveUserSettings(userId: string, settings: Settings): Promise<void> {
  const db = getDb();
  await db
    .insert(userSettings)
    .values({
      userId,
      defaultModel: settings.defaultModel,
      postToGithubDefault: settings.postToGithubDefault,
      reviewProfile: settings.reviewProfile,
    })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: {
        defaultModel: settings.defaultModel,
        postToGithubDefault: settings.postToGithubDefault,
        reviewProfile: settings.reviewProfile,
        updatedAt: new Date(),
      },
    });
}
