/**
 * Settings types and constants with no database imports, so client components
 * can use them without pulling `pg` into the browser bundle.
 * Database access lives in ./settings.ts (server only).
 */
import { DEFAULT_MODEL } from "./models";

export type ReviewProfile = "quiet" | "chill" | "assertive";

export interface Settings {
  defaultModel: string;
  postToGithubDefault: boolean;
  reviewProfile: ReviewProfile;
}

export const DEFAULT_SETTINGS: Settings = {
  defaultModel: DEFAULT_MODEL,
  postToGithubDefault: true,
  reviewProfile: "chill",
};

export const REVIEW_PROFILES: { id: ReviewProfile; label: string; description: string }[] = [
  { id: "quiet", label: "Quiet", description: "Only the most important findings." },
  { id: "chill", label: "Chill", description: "Balanced feedback." },
  { id: "assertive", label: "Assertive", description: "More feedback, which may feel nitpicky." },
];

export function isReviewProfile(value: string): value is ReviewProfile {
  return value === "quiet" || value === "chill" || value === "assertive";
}
