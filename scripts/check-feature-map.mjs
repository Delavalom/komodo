/**
 * docs/feature-map.md is what the reviewer reads to write verification steps
 * for a pull request to Komodo. A route missing from it is a screen the
 * reviewer has to guess its way to, and a map nobody checks goes stale the
 * first time a page is added. This lists every page in apps/web and fails
 * when one is not named in the map.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const appDir = join(root, "apps/web/src/app");
const mapPath = join(root, "docs/feature-map.md");

function pages(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return pages(full);
    return entry.name === "page.tsx" ? [full] : [];
  });
}

/** `app/(app)/[org]/-/queue/page.tsx` → `/[org]/-/queue`. Route groups are not in the URL. */
function routeOf(page) {
  const segments = relative(appDir, page)
    .split(sep)
    .slice(0, -1)
    .filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")));
  return `/${segments.join("/")}`;
}

const map = readFileSync(mapPath, "utf8");
const routes = pages(appDir).map(routeOf).sort();
const missing = routes.filter((route) => !map.includes(`\`${route}\``));

if (missing.length) {
  console.error(
    `docs/feature-map.md does not name ${missing.length} route(s):\n` +
      missing.map((route) => `  ${route}`).join("\n") +
      "\nAdd each one, in backticks, with what a person does there.",
  );
  process.exit(1);
}

console.log(`✔ docs/feature-map.md names all ${routes.length} routes`);
