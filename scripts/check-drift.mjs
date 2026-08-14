#!/usr/bin/env node
/**
 * Guards the cloud/OSS split.
 *
 * apps/web and packages/ui once diverged silently: the same components existed
 * twice and the design tokens were hand-synced under different names, with a
 * comment in each file claiming to be canonical. These checks make that class
 * of drift fail the build instead of accumulating.
 *
 * Run by `pnpm test` at the repo root.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const failures = [];

/** Directories whose components must live in packages/ui instead. */
const FORBIDDEN_DIRS = [
  {
    path: "apps/web/src/components/ui",
    why: "Design-system components belong in packages/ui/src/kit so the CLI viewer gets them too.",
  },
];

/**
 * The one file allowed to define design tokens.
 *
 * apps/marketing is a knowing exception: it is a standalone Astro landing page
 * with no Tailwind and no shared components, so it cannot consume an @theme
 * block. It shares no code with the apps below, so it is not on the drift path.
 */
const TOKEN_SOURCE = "packages/tokens/theme.css";
const TOKEN_SCAN_ROOTS = ["apps/web", "packages"];
/**
 * A token *declaration*, anywhere in the file — deliberately not anchored to
 * the line start, or `:root { --color-accent: red }` on one line would slip
 * through. Reads like `var(--color-accent)` have no colon after the name, so
 * they do not match.
 */
const TOKEN_PATTERN = /--color-[a-z0-9-]+\s*:/;

const SKIP_DIRS = new Set(["node_modules", "dist", ".next", ".git", ".omc", "coverage"]);

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

// ---- 1. components that must not come back ----
for (const { path, why } of FORBIDDEN_DIRS) {
  if (existsSync(join(root, path))) {
    failures.push(`${path} exists again.\n    ${why}`);
  }
}

// ---- 2. exactly one design-token definition site ----
const tokenFiles = [];
for (const scanRoot of TOKEN_SCAN_ROOTS) {
  for (const file of walk(join(root, scanRoot))) {
    if (!file.endsWith(".css")) continue;
    if (TOKEN_PATTERN.test(readFileSync(file, "utf8"))) {
      tokenFiles.push(relative(root, file));
    }
  }
}

const strays = tokenFiles.filter((f) => f !== TOKEN_SOURCE);
if (strays.length) {
  failures.push(
    `Design tokens are defined outside ${TOKEN_SOURCE}:\n` +
      strays.map((f) => `    ${f}`).join("\n") +
      `\n    Import the shared theme instead of redeclaring --color-* values.`,
  );
}
if (!tokenFiles.includes(TOKEN_SOURCE)) {
  failures.push(`${TOKEN_SOURCE} no longer defines any --color-* tokens.`);
}

// ---- 3. client code must not import the engine barrel ----
// @komodo/core's entry reaches the review engine and its Node-only deps;
// browser code has to come in through the client-safe /store subpath.
for (const file of walk(join(root, "packages/ui/src"))) {
  if (!/\.tsx?$/.test(file)) continue;
  if (/from "@komodo\/core"/.test(readFileSync(file, "utf8"))) {
    failures.push(
      `${relative(root, file)} imports "@komodo/core".\n` +
        `    Use "@komodo/core/store" — the barrel pulls Node-only dependencies into the browser bundle.`,
    );
  }
}

if (failures.length) {
  console.error("\n✗ Shared-code drift detected:\n");
  for (const f of failures) console.error(`  • ${f}\n`);
  process.exit(1);
}

console.log(`✓ no drift: tokens defined only in ${TOKEN_SOURCE}, shared components intact`);
