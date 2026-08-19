import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* @komodo/store's drivers reach node:sqlite. Keeping the package external
     leaves those imports to Node instead of the bundler; the app's own
     imports from it are types, which erase before they ever reach a chunk. */
  serverExternalPackages: ["@komodo/store"],
};

export default nextConfig;
