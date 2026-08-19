import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/sqlite.ts", "src/seed.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  dts: true,
  clean: true,
  /**
   * tsup strips the `node:` prefix by default. Most builtins survive that —
   * `fs` still resolves — but there is no bare `sqlite` builtin, so the
   * emitted import resolves nowhere and every downstream bundler fails on it.
   */
  removeNodeProtocol: false,
});
