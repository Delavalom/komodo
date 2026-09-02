#!/usr/bin/env node
import { Command } from "commander";
import { diffCommand } from "./commands/diff.js";
import { initCommand } from "./commands/init.js";
import { prCommand } from "./commands/pr.js";
import { promptCommand } from "./commands/prompt.js";
import { devCommand, serveCommand } from "./commands/serve.js";
import { validateCommand } from "./commands/validate.js";
import { configCommand } from "./commands/config.js";
import { doctorCommand } from "./commands/doctor.js";
import { claimCommand } from "./commands/claim.js";
import { loginCommand } from "./commands/login.js";
import { pushCommand } from "./commands/push.js";
import { submitCommand } from "./commands/submit.js";
import { cliVersion } from "./web.js";

const program = new Command();

program
  .name("komodo-review")
  .description("🦎 AI code review on your own Claude or ChatGPT subscription")
  .version(cliVersion());

program
  .command("init")
  .description("Detect your AI subscription + GitHub auth and write komodo.yaml")
  .option("-f, --force", "overwrite an existing komodo.yaml", false)
  .action(initCommand);

program
  .command("pr")
  .argument("<ref>", "PR URL, owner/repo#123, or a number (inside a repo clone)")
  .description("Review a pull request and post the review to GitHub")
  .option("--local-only", "do not post to GitHub; just write the local review record", false)
  .option("--provider <name>", "claude | codex (default: from komodo.yaml / auto-detect)")
  .option("--model <model>", "model override passed to the provider")
  .option("--no-ui", "do not print the local UI hint")
  .action(prCommand);

program
  .command("dev")
  .description("Start the review queue locally — store, ingester and UI in one command")
  .option("-p, --port <port>", "port", "4400")
  .option("--db <path>", "database file (default .komodo/komodo.db)")
  .option("--interval <seconds>", "seconds between GitHub polls", "60")
  .option("--no-poll", "serve the UI without polling GitHub")
  .option("--no-seed", "start empty instead of seeding a sample queue")
  .option("--post", "post reviews back to GitHub", false)
  .option("--provider <name>", "claude | codex | openrouter")
  .option("--no-checkout", "review diffs only, without fetching a working tree")
  .option("--repo-cache <dir>", "where working trees are kept (default .komodo/repos)")
  .action(devCommand);

program
  .command("serve")
  .description("Run the review queue as a long-lived service for a team")
  .option("-p, --port <port>", "port", "4400")
  .option("--db <path>", "database file (default .komodo/komodo.db)")
  .option("--interval <seconds>", "seconds between GitHub polls", "60")
  .option("--no-poll", "serve the UI without polling GitHub")
  .option("--seed", "seed a sample queue when the store is empty", false)
  .option("--post", "post reviews back to GitHub", false)
  .option("--provider <name>", "claude | codex | openrouter")
  .option("--no-checkout", "review diffs only, without fetching a working tree")
  .option("--repo-cache <dir>", "where working trees are kept (default .komodo/repos)")
  .action(serveCommand);

program
  .command("diff")
  .description("Output annotated diff JSON for the current branch (used by the skill)")
  .option("--base <branch>", "base branch to diff against (default: auto-detect)")
  .action(diffCommand);

program
  .command("prompt")
  .description("Print the review prompt for the current branch (used by the skill)")
  .option("--base <branch>", "base branch to diff against (default: auto-detect)")
  .action(promptCommand);

program
  .command("validate")
  .argument("<path>", "Path to a ReviewRecord JSON file to validate and save")
  .description("Validate a review record and save it to .komodo/reviews/")
  .action(validateCommand);

program
  .command("push")
  .argument("<record>", "review record JSON saved by komodo-review validate")
  .description("Send a locally produced review to a team's Komodo deployment")
  .option("--pr <ref>", "pull request the review belongs to, e.g. owner/repo#123")
  .option("--host <url>", "deployment URL (default: the saved login)")
  .option("--api-key <key>", "API key for --host")
  .action(pushCommand);

program
  .command("config")
  .description("Print the resolved komodo.yaml configuration")
  .action(configCommand);

program
  .command("doctor")
  .argument("[provider]", "provider to diagnose", "claude")
  .description("Verify the provider launcher, proxy, authentication, and SDK session")
  .action(doctorCommand);

program
  .command("login")
  .description("Save a Komodo deployment and API key for claim and submit")
  .option("--host <url>", "deployment URL, e.g. http://localhost:4400")
  .option("--api-key <key>", "API key minted under Settings → API Keys")
  .option("--forget", "delete the saved host and key", false)
  .action(loginCommand);

program
  .command("claim")
  .description("Claim one queued review for the current interactive agent session")
  .option("--host <url>", "Komodo deployment to claim from (default: the saved login)")
  .option("--api-key <key>", "API key for --host")
  .option("--db <path>", "local Komodo database (default .komodo/komodo.db)")
  .option("--out <path>", "claim context JSON path")
  .action(claimCommand);

program
  .command("submit")
  .argument("<claim>", "claim context JSON from komodo-review claim")
  .argument("<result>", "ReviewResult JSON written by the interactive agent")
  .description("Validate an interactive review and complete its Komodo job")
  .option("--base <branch>", "base branch to diff against (default: auto-detect)")
  .option("--api-key <key>", "API key, when the claim names a remote deployment")
  .action(submitCommand);

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
