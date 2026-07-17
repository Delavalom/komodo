#!/usr/bin/env node
import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { prCommand } from "./commands/pr.js";
import { uiCommand } from "./commands/ui.js";
import { configCommand } from "./commands/config.js";

const program = new Command();

program
  .name("komodo-review")
  .description("🦎 AI code review on your own Claude or ChatGPT subscription")
  .version("0.1.0");

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
  .command("ui")
  .description("Serve the local review viewer for this repo's .komodo/reviews")
  .option("-p, --port <port>", "port", "4400")
  .action(uiCommand);

program
  .command("config")
  .description("Print the resolved komodo.yaml configuration")
  .action(configCommand);

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
