/**
 * Completing Next's standalone output.
 *
 * Two things are missing from it and both are load-bearing for `komodo dev`:
 *
 * 1. .next/static and public — deliberately omitted, because the standalone
 *    server assumes a CDN serves them. There is no CDN here.
 * 2. Packages the tracer only half-copied. It follows what the build actually
 *    loaded, which for @swc/helpers is the CJS half, while the emitted server
 *    imports the ESM half — so the bundle dies on its first require. Copying
 *    the package whole is cheap and removes a very confusing failure.
 */
import { cpSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = dirname(dirname(fileURLToPath(import.meta.url)));
const root = join(web, "..", "..");
const standalone = join(web, ".next", "standalone", "apps", "web");
const bundledModules = join(web, ".next", "standalone", "node_modules");

if (!existsSync(standalone)) {
  console.error('No standalone output — is `output: "standalone"` still set?');
  process.exit(1);
}

cpSync(join(web, ".next", "static"), join(standalone, ".next", "static"), {
  recursive: true,
});
if (existsSync(join(web, "public"))) {
  cpSync(join(web, "public"), join(standalone, "public"), { recursive: true });
}

/** Packages the tracer is known to copy incompletely. */
const COMPLETE_WHOLE = ["@swc/helpers"];

for (const name of COMPLETE_WHOLE) {
  const source = findInPnpmStore(join(root, "node_modules", ".pnpm"), name);
  if (!source) continue;
  for (const target of findInPnpmStoreAll(join(bundledModules, ".pnpm"), name)) {
    cpSync(source, target, { recursive: true });
  }
}

function storeDirs(store) {
  return existsSync(store) ? readdirSync(store) : [];
}

function findInPnpmStore(store, name) {
  const slug = name.replace("/", "+");
  for (const entry of storeDirs(store)) {
    if (!entry.startsWith(`${slug}@`)) continue;
    const path = join(store, entry, "node_modules", name);
    if (existsSync(path)) return path;
  }
  return null;
}

function findInPnpmStoreAll(store, name) {
  const slug = name.replace("/", "+");
  const out = [];
  for (const entry of storeDirs(store)) {
    if (!entry.startsWith(`${slug}@`)) continue;
    out.push(join(store, entry, "node_modules", name));
  }
  return out;
}

console.log("standalone assets copied →", standalone);
