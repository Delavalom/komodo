import { execFileSync } from "node:child_process";
import { accessSync, constants, realpathSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import type { KomodoConfig } from "../config.js";
import { ClaudeProvider } from "./claude.js";
import { CodexProvider, codexLoggedIn } from "./codex.js";
import type { ReviewProvider } from "./types.js";

export { ClaudeProvider } from "./claude.js";
export { CodexProvider, codexLoggedIn } from "./codex.js";
export { OpenRouterProvider, type OpenRouterUsage } from "./openrouter.js";
export { buildReviewPrompt } from "./prompt.js";
export {
  RereadResultSchema,
  buildRereadPrompt,
  rereadJsonSchema,
  type RereadInput,
  type RereadProvider,
  type RereadResult,
} from "./reread.js";
export type { ReviewInput, ReviewMemory, ReviewProvider } from "./types.js";

export interface ProviderStatus {
  claude: boolean;
  codex: boolean;
}

/** Detect which subscription-backed providers are usable on this machine.
 * Detection only — Komodo never initiates a login on the user's behalf. */
export function detectProviders(config?: Pick<KomodoConfig, "claude">): ProviderStatus {
  let claude = false;
  const executable = resolveClaudeExecutable(config);
  try {
    execFileSync(/*turbopackIgnore: true*/ executable ?? "claude", ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
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
  const claude = () =>
    new ClaudeProvider({
      model: config.model,
      executable: resolveClaudeExecutable(config),
    });
  if (choice === "claude") return claude();
  if (choice === "codex") return new CodexProvider(config.model);
  if (choice === "openrouter") {
    throw new Error("The openrouter provider is available in Komodo Cloud; locally use claude or codex.");
  }
  const status = detectProviders(config);
  if (status.claude) return claude();
  if (status.codex) return new CodexProvider(config.model);
  throw new Error(
    "No AI provider available. Sign in to Claude Code (`claude`) or Codex (`codex login`) yourself, or set ANTHROPIC_API_KEY.",
  );
}

/**
 * Resolves and validates the one user-supplied path before it reaches a child
 * process. Bare command names are deliberately unsupported here: an
 * enterprise launcher must not silently fall back to a different PATH entry.
 */
export function resolveClaudeExecutable(
  config?: Pick<KomodoConfig, "claude">,
): string | undefined {
  const supplied =
    process.env.KOMODO_CLAUDE_EXECUTABLE ?? config?.claude.executable;
  if (!supplied) return undefined;
  if (!isAbsolute(supplied)) {
    throw new Error(
      `Claude executable must be an absolute path, received: ${supplied}`,
    );
  }

  let resolved: string;
  try {
    resolved = realpathSync(/*turbopackIgnore: true*/ supplied);
    if (!statSync(/*turbopackIgnore: true*/ resolved).isFile()) {
      throw new Error("not a regular file");
    }
    accessSync(/*turbopackIgnore: true*/ resolved, constants.X_OK);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Claude executable is not runnable: ${supplied} (${detail})`);
  }
  return resolved;
}
