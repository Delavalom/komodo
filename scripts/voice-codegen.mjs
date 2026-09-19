/**
 * Shared by generate-voice.mjs and check-voice.mjs.
 *
 * VOICE_STYLE.md at the repository root is the one place the house voice is
 * written down — the prompt, the re-read note, and the rendered comments all
 * read it through this generated module rather than each carrying their own
 * copy. It is generated rather than read off disk at runtime because
 * @komodo/core ships as a built package and cannot assume the repository root
 * is still nearby; it is committed rather than produced only by the build so
 * `vitest` and `tsc` can import it straight from source, the same as every
 * other file in `src`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const SOURCE_PATH = join(root, "VOICE_STYLE.md");
export const TARGET_PATH = join(root, "packages/core/src/voice-style.generated.ts");

export function renderVoiceModule() {
  const md = readFileSync(SOURCE_PATH, "utf8").trimEnd() + "\n";
  return `/**
 * GENERATED — do not edit by hand.
 *
 * Source: VOICE_STYLE.md at the repository root. Regenerate with
 * \`node scripts/generate-voice.mjs\` after editing that file;
 * \`pnpm test\` fails via check-voice.mjs if this drifts from it.
 */
export const VOICE_STYLE_MD = ${JSON.stringify(md)};
`;
}
