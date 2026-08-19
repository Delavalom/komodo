import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pc from "picocolors";
import { CONFIG_FILENAMES, detectProviders } from "@komodo/core";

const TEMPLATE = `# Komodo code review configuration — https://github.com/Delavalom/komodo
provider: auto        # auto | claude | codex
profile: chill        # chill (signal only) | assertive (thorough)
min_severity: minor   # critical | major | minor | trivial

# path_filters:       # extra globs; "!" excludes. Lockfiles/dist/binaries are excluded by default.
#   - "!docs/**"
# path_instructions:
#   - path: "src/api/**"
#     instructions: "Check authorization and input validation on every handler."

post:
  update_description: false   # inject "Summary by Komodo" into the PR description
  request_changes: true       # request changes when major/critical findings exist
  status_check: false         # post a commit status (pass/fail gate)
`;

export async function initCommand(opts: { force: boolean }): Promise<void> {
  console.log(pc.bold("\n🦎 Komodo setup — two steps\n"));

  console.log(pc.bold("Step 1: connections"));
  let gh = false;
  try {
    const user = execFileSync("gh", ["api", "user", "--jq", ".login"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    gh = true;
    console.log(`  ${pc.green("✓")} GitHub: signed in as ${pc.bold(user)} (gh CLI)`);
  } catch {
    console.log(
      `  ${pc.red("✗")} GitHub: not connected — run ${pc.cyan("gh auth login")} or export GITHUB_TOKEN`,
    );
  }

  const providers = detectProviders();
  if (providers.claude) {
    console.log(`  ${pc.green("✓")} Claude: available (your Claude Code login / API key will be used)`);
  } else {
    console.log(
      `  ${pc.yellow("○")} Claude: not detected — if you have a Claude subscription, sign in yourself with ${pc.cyan("claude")}`,
    );
  }
  if (providers.codex) {
    console.log(`  ${pc.green("✓")} Codex: available (your ChatGPT login will be used)`);
  } else {
    console.log(
      `  ${pc.yellow("○")} Codex: not detected — if you have a ChatGPT subscription, sign in yourself with ${pc.cyan("codex login")}`,
    );
  }
  console.log(
    pc.dim(
      "  Komodo never signs you in or stores credentials — it only uses logins you created with the official CLIs, on this machine.",
    ),
  );

  console.log(pc.bold("\nStep 2: configuration"));
  const existing = CONFIG_FILENAMES.find((f) => existsSync(join(process.cwd(), f)));
  if (existing && !opts.force) {
    console.log(`  ${pc.green("✓")} ${existing} already exists (use --force to overwrite)`);
  } else {
    writeFileSync(join(process.cwd(), "komodo.yaml"), TEMPLATE);
    console.log(`  ${pc.green("✓")} wrote komodo.yaml`);
  }

  const ready = gh && (providers.claude || providers.codex);
  console.log(
    ready
      ? pc.bold(pc.green("\nReady. Review your first PR:\n")) + pc.cyan("  npx komodo-review pr <url|number>\n")
      : pc.bold(pc.yellow("\nFix the ✗ items above, then run: ")) + pc.cyan("npx komodo-review pr <url|number>\n"),
  );
}
