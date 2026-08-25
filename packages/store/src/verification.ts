/**
 * Stable identity for one verification requirement.
 *
 * A review can be regenerated for the same head. Evidence must follow the
 * check it substantiates, not whichever check happens to occupy the same
 * ordinal after that regeneration. Two seeded FNV-1a passes give the content
 * key enough room without pulling Node crypto into the client-safe package.
 */
export function verificationRequirementId(
  reviewId: string,
  check: {
    title: string;
    instruction: string;
    expectedResult: string;
  },
): string {
  const text = [check.title, check.instruction, check.expectedResult].join("\u0000");
  return `${reviewId}:verify:${fnv1a(text, 0x811c9dc5)}${fnv1a(text, 0x9e3779b9)}`;
}

function fnv1a(text: string, seed: number): string {
  let hash = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
