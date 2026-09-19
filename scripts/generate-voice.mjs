import { writeFileSync } from "node:fs";
import { renderVoiceModule, TARGET_PATH } from "./voice-codegen.mjs";

writeFileSync(TARGET_PATH, renderVoiceModule());
console.log(`wrote ${TARGET_PATH}`);
