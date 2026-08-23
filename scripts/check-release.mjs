/**
 * One release, one version number.
 *
 * Komodo ships as two artifacts from one repository — the npm package and the
 * Claude Code plugin — and the version appears in four places across three
 * files. They drifted once already: the plugin advertised 0.4.0 while the npm
 * package sat at 0.2.0, so `/plugin install` and `npx komodo-review` handed
 * people different releases of the same tool. Nothing caught it, because
 * nothing was looking.
 *
 * The plugin cache is keyed by version (~/.claude/plugins/cache/<mp>/<p>/<v>/),
 * so a plugin change that ships without a bump reaches nobody. That makes the
 * bump part of the release rather than a courtesy, and this the check that
 * says so.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));

const marketplace = read(".claude-plugin/marketplace.json");
const plugin = read("plugin/.claude-plugin/plugin.json");
const cli = read("packages/cli/package.json");

const versions = [
  ["packages/cli/package.json", "version", cli.version],
  ["plugin/.claude-plugin/plugin.json", "version", plugin.version],
  [".claude-plugin/marketplace.json", "metadata.version", marketplace.metadata?.version],
  [
    ".claude-plugin/marketplace.json",
    `plugins[${marketplace.plugins?.findIndex((p) => p.name === plugin.name)}].version`,
    marketplace.plugins?.find((p) => p.name === plugin.name)?.version,
  ],
];

const distinct = new Set(versions.map(([, , version]) => version));

if (distinct.size !== 1 || distinct.has(undefined)) {
  console.error("Version drift — these must all be the same:\n");
  for (const [file, field, version] of versions) {
    console.error(`  ${version ?? "(missing)"}\t${file} → ${field}`);
  }
  console.error("\nSet them to the version being released, then commit them together.");
  process.exit(1);
}

// The marketplace names the plugin's directory; a rename there is silent until
// someone tries to install it.
const source = marketplace.plugins?.find((p) => p.name === plugin.name)?.source;
if (source !== "./plugin") {
  console.error(
    `marketplace.json points plugin "${plugin.name}" at ${source ?? "(nothing)"}, ` +
      "but the manifest lives in ./plugin.",
  );
  process.exit(1);
}

// A skill without SKILL.md is not registered, and the plugin installs
// looking exactly as healthy as one that works.
for (const dir of listing("plugin/skills")) {
  if (!existsSync(join(root, "plugin/skills", dir, "SKILL.md"))) {
    console.error(`plugin/skills/${dir} has no SKILL.md — it will not load.`);
    process.exit(1);
  }
}

if (listing("plugin/skills").length === 0 && listing("plugin/commands").length === 0) {
  console.error("plugin/ carries neither a skill nor a command.");
  process.exit(1);
}

function listing(path) {
  const dir = join(root, path);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => (path.endsWith("skills") ? entry.isDirectory() : entry.isFile()))
    .map((entry) => entry.name);
}

console.log(`✔ release manifests agree at ${[...distinct][0]}`);
