import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  clean: true,
  /* The CLI is installed on its own, not as part of the workspace, so the
     packages it depends on are bundled in rather than resolved at runtime. */
  noExternal: ["@komodo/core", "@komodo/store", "@komodo/ingest"],
  /* @komodo/store reaches node:sqlite, and there is no bare `sqlite`. */
  removeNodeProtocol: false,
});
