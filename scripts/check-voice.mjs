/**
 * VOICE_STYLE.md drifting from packages/core/src/voice-style.generated.ts is
 * the same failure mode check-release.mjs guards against for version
 * numbers: a source of truth and a copy of it, silently disagreeing. This
 * regenerates the module in memory and fails if the committed file disagrees.
 */
import { existsSync, readFileSync } from "node:fs";
import { renderVoiceModule, TARGET_PATH } from "./voice-codegen.mjs";

const expected = renderVoiceModule();
const actual = existsSync(TARGET_PATH) ? readFileSync(TARGET_PATH, "utf8") : null;

if (actual !== expected) {
  console.error(
    `${TARGET_PATH} is out of date with VOICE_STYLE.md.\n` +
      "Run `node scripts/generate-voice.mjs` and commit the result.",
  );
  process.exit(1);
}

console.log("✔ voice-style.generated.ts matches VOICE_STYLE.md");
