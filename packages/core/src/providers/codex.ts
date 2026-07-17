import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { ReviewResultSchema, reviewResultJsonSchema, type ReviewResult } from "../schema.js";
import { buildReviewPrompt } from "./prompt.js";
import type { ReviewInput, ReviewProvider } from "./types.js";

const execFileAsync = promisify(execFile);

export function codexLoggedIn(): boolean {
  if (!existsSync(join(homedir(), ".codex", "auth.json"))) return false;
  try {
    execFileSync("codex", ["--version"], { stdio: ["ignore", "pipe", "ignore"] });
    return true;
  } catch {
    return false;
  }
}

/**
 * Reviews via the Codex CLI in headless mode (`codex exec`), billing the
 * user's own ChatGPT plan through the login they created with `codex login`.
 */
export class CodexProvider implements ReviewProvider {
  readonly name = "codex";
  constructor(private model?: string) {}

  async review(input: ReviewInput, onProgress?: (msg: string) => void): Promise<ReviewResult> {
    const prompt = buildReviewPrompt(input);
    const dir = mkdtempSync(join(tmpdir(), "komodo-codex-"));
    const schemaPath = join(dir, "schema.json");
    const outPath = join(dir, "last-message.txt");
    writeFileSync(schemaPath, JSON.stringify(reviewResultJsonSchema()));
    try {
      onProgress?.("Running codex exec (this can take a few minutes)…");
      const args = [
        "exec",
        "--sandbox",
        "read-only",
        "--skip-git-repo-check",
        "--output-schema",
        schemaPath,
        "--output-last-message",
        outPath,
        ...(this.model ? ["--model", this.model] : []),
        "-",
      ];
      await execFileAsync("codex", args, {
        cwd: input.repoDir ?? process.cwd(),
        input: prompt,
        maxBuffer: 64 * 1024 * 1024,
        timeout: 15 * 60 * 1000,
      } as any);
      const { readFileSync } = await import("node:fs");
      const last = readFileSync(outPath, "utf8");
      return ReviewResultSchema.parse(JSON.parse(last));
    } catch (err: any) {
      if (err?.code === "ENOENT") {
        throw new Error("Codex CLI not found. Install it (`npm i -g @openai/codex`) and run `codex login`.");
      }
      throw new Error(`Codex review failed: ${err?.message ?? err}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}
