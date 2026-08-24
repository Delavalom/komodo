import { execFileSync } from "node:child_process";

import {
  ClaudeProvider,
  loadConfig,
  resolveClaudeExecutable,
} from "@komodo/core";

/** Diagnose the exact Claude execution path Komodo will use. */
export async function doctorCommand(provider: string = "claude"): Promise<void> {
  if (provider !== "claude") {
    throw new Error(`Unknown provider \"${provider}\". Doctor currently supports claude.`);
  }

  const { config, path } = loadConfig();
  const executable = resolveClaudeExecutable(config);
  const command = executable ?? "claude";
  const version = execFileSync(command, ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

  console.log(`Config: ${path ?? "defaults"}`);
  console.log(`Claude executable: ${command}`);
  console.log(`Launcher: ${version}`);
  console.log("Checking the managed Agent SDK session (no repository data is sent)…");

  const claude = new ClaudeProvider({
    model: config.model,
    executable,
  });
  const response = await claude.healthCheck();
  console.log(`Agent SDK: connected (${response || "OK"})`);
}
