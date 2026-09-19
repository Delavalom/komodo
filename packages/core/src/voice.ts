/**
 * One voice for everything Komodo writes to a person.
 *
 * `VOICE_STYLE.md` at the repository root is modelled on how two of a real
 * team's principal engineers actually write review comments, because the
 * failure this exists to fix is a specific one: a reviewer reading an
 * AI-drafted reply and immediately asking whether a person wrote it. The
 * style should be indistinguishable from a colleague, not a giveaway.
 *
 * `voice-style.generated.ts` is the committed copy of that file — see
 * `scripts/voice-codegen.mjs` for why generation beats a runtime read here.
 * Everything in this module treats the markdown as an opaque block of prose
 * to hand the model, plus a handful of mechanical rules cheap enough to lint
 * without understanding English.
 */
import { VOICE_STYLE_MD } from "./voice-style.generated.js";

/** The house voice, verbatim from `VOICE_STYLE.md`. */
export const VOICE_STYLE = VOICE_STYLE_MD;

/**
 * The prompt section a provider reads.
 *
 * `extra` is a team's own vocabulary — `voice.extra` in komodo.yaml — never a
 * replacement for the house voice. It is appended, not merged in, so a team
 * cannot accidentally turn "always write like this" into "unless you'd
 * rather not".
 */
export function voiceSection(extra?: string): string {
  const trimmedExtra = extra?.trim();
  const parts = [`## How to write\n\n${VOICE_STYLE_MD}`];
  if (trimmedExtra) {
    parts.push(`## This team's vocabulary\n${trimmedExtra}`);
  }
  return parts.join("\n\n");
}

export interface VoiceViolation {
  /** Which rule from VOICE_STYLE.md this breaks. */
  rule: string;
  /** The offending substring, for a human reading the lint output. */
  match: string;
}

/**
 * Phrases the style asset names outright as things not to write. Matched
 * case-insensitively; a hit is a strong signal, not a certainty, since a
 * legitimate sentence can still contain one of these words in a different
 * sense.
 */
const BANNED_PHRASES = [
  "consider refactoring",
  "it is worth noting",
  "it's worth noting",
  "one deliberate deviation",
  "it might be worth",
  "you may want to",
];

/**
 * The mechanical half of the style: the rules a regex can actually judge.
 *
 * This is a test aid and a debug-log signal, never a gate. A review that
 * trips the lint is still a review; nothing here rejects or retries a
 * generation. See `voice.test.ts` for the two worked examples this is
 * checked against.
 */
export function voiceLint(text: string): VoiceViolation[] {
  const violations: VoiceViolation[] = [];

  const emDash = text.match(/—/);
  if (emDash) violations.push({ rule: "no em-dash", match: emDash[0] });

  const semicolon = text.match(/;/);
  if (semicolon) violations.push({ rule: "no semicolon", match: semicolon[0] });

  const bold = text.match(/\*\*[^*]+\*\*/);
  if (bold) violations.push({ rule: "no bold", match: bold[0] });

  const header = text.match(/^#{1,6}\s.*$/m);
  if (header) violations.push({ rule: "no header", match: header[0] });

  for (const phrase of BANNED_PHRASES) {
    const hit = text.match(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    if (hit) violations.push({ rule: `never: "${phrase}"`, match: hit[0] });
  }

  return violations;
}
