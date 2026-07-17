import { execFileSync } from "node:child_process";
import type { KomodoConfig } from "../config.js";
import { ClaudeProvider } from "./claude.js";
import { CodexProvider, codexLoggedIn } from "./codex.js";
import type { ReviewProvider } from "./types.js";

export { ClaudeProvider } from "./claude.js";
export { CodexProvider, codexLoggedIn } from "./codex.js";
export { OpenRouterProvider, type OpenRouterUsage } from "./openrouter.js";
export { buildReviewPrompt } from "./prompt.js";
export type { ReviewInput, ReviewProvider } from "./types.js";

export interface ProviderStatus {
  claude: boolean;
  codex: boolean;
}

/** Detect which subscription-backed providers are usable on this machine.
 * Detection only — Komodo never initiates a login on the user's behalf. */
export function detectProviders(): ProviderStatus {
  let claude = false;
  try {
    execFileSync("claude", ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    claude = true;
  } catch {
    // The Agent SDK bundles a runtime, but without the CLI we can't assume a
    // subscription login exists; an API key still works.
    claude = !!process.env.ANTHROPIC_API_KEY || !!process.env.CLAUDE_CODE_OAUTH_TOKEN;
  }
  return { claude, codex: codexLoggedIn() };
}

export function createProvider(config: KomodoConfig, override?: string): ReviewProvider {
  const choice = override ?? config.provider;
  if (choice === "claude") return new ClaudeProvider(config.model);
  if (choice === "codex") return new CodexProvider(config.model);
  if (choice === "openrouter") {
    throw new Error("The openrouter provider is available in Komodo Cloud; locally use claude or codex.");
  }
  const status = detectProviders();
  if (status.claude) return new ClaudeProvider(config.model);
  if (status.codex) return new CodexProvider(config.model);
  throw new Error(
    "No AI provider available. Sign in to Claude Code (`claude`) or Codex (`codex login`) yourself, or set ANTHROPIC_API_KEY.",
  );
}
