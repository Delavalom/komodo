import { cpSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const uiDist = join(here, "..", "..", "ui", "dist");
const target = join(here, "..", "dist", "ui");

if (existsSync(uiDist)) {
  cpSync(uiDist, target, { recursive: true });
  console.log("copied @komodo/ui dist →", target);
} else {
  console.warn("warning: @komodo/ui not built yet; `komodo-review ui` will not serve the viewer");
}
