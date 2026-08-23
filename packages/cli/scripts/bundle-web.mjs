/**
 * Packing the web app into the CLI's npm tarball.
 *
 * npm removes any directory named node_modules from a published package, and
 * a Next standalone server resolves its own requires out of exactly that
 * directory. Shipping the bundle as a directory therefore publishes a hollow
 * one that dies on its first require — which is what the registry's 0.2.0
 * would have done had it carried this app instead of the old Vite UI. A
 * tarball is a file, so it travels intact; src/web.ts unpacks it on first run.
 *
 * `pnpm -r build` does not order this after apps/web — the CLI does not
 * depend on it — so a missing bundle is a warning here and an error under
 * --require, which `prepack` uses. The rule is: you can build the CLI without
 * the app, but you cannot publish it without the app.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const cli = dirname(dirname(fileURLToPath(import.meta.url)));
const web = join(cli, "..", "..", "apps", "web");
const next = join(web, ".next");
const standalone = join(next, "standalone");
const required = process.argv.includes("--require");

if (!existsSync(join(standalone, "apps", "web", "server.js"))) {
  const message =
    "No standalone web build at apps/web/.next/standalone.\n" +
    "Build it first:  pnpm -C apps/web build";
  if (required) {
    console.error(message);
    process.exit(1);
  }
  console.warn(`⚠ ${message}\n  Skipping — this CLI build cannot run \`dev\` or \`serve\`.`);
  process.exit(0);
}

// .next/static is copied into the standalone tree by apps/web's own build
// step; without it the app serves markup and no assets, which looks like a
// broken deploy rather than a missing file.
if (!existsSync(join(standalone, "apps", "web", ".next", "static"))) {
  console.error(
    "The standalone build is missing .next/static — run apps/web's full build\n" +
      "(`pnpm -C apps/web build`), not `next build` on its own.",
  );
  process.exit(1);
}

const dist = join(cli, "dist");
mkdirSync(dist, { recursive: true });
const out = join(dist, "web.tgz");

// -C .next so the archive root is `standalone/`, which is the layout
// src/web.ts expects after extraction.
execFileSync("tar", ["-czf", out, "-C", next, "standalone"], { stdio: "inherit" });

const mb = (statSync(out).size / 1024 / 1024).toFixed(1);
console.log(`web bundle → ${out} (${mb} MB)`);
