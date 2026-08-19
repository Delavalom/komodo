import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const here = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  /* @komodo/store's drivers reach node:sqlite. Keeping the package external
     leaves those imports to Node instead of the bundler; the app's own
     imports from it are types, which erase before they ever reach a chunk. */
  serverExternalPackages: ["@komodo/store"],

  /* `komodo serve` has to start a web server on a machine that never ran
     pnpm install, so the app ships as a self-contained server bundle. */
  output: "standalone",

  /* Tracing has to start at the workspace root: pnpm keeps the real files in
     the root .pnpm store and leaves symlinks here, so a trace rooted at the
     app misses transitive dependencies and the bundle dies on first require. */
  outputFileTracingRoot: join(here, "..", ".."),
};

export default nextConfig;
