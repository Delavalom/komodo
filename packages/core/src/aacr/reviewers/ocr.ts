import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join } from "node:path";
import type { AacrInstance, GeneratedComment, Reviewer, ReviewerRun } from "../types.js";
import {
  OCR_DELEGATE_COMMAND_MD,
  OCR_DELEGATE_SKILL_MD,
  OCR_PLUGIN_JSON,
} from "./ocr-delegate-plugin.js";

/**
 * OpenCodeReview (`ocr`) as an opponent reviewer for AACR runs.
 *
 * Two ways to put a model behind it:
 *
 * - `delegate` — OCR's own delegation mode. `ocr delegate preview|rule` does
 *   the file selection and rule resolution; the host agent (Claude Code, on
 *   the user's subscription) does the review itself. This is the same model
 *   and the same login Komodo's ClaudeProvider uses, so it is the like-for-
 *   like comparison.
 * - `managed` — plain `ocr review`, OCR's own multi-agent loop and
 *   post-filter, pointed at an OpenAI-compatible endpoint (OpenRouter). This
 *   is what OCR ships as its product, but on a different transport than
 *   Komodo's.
 */
export type OcrMode = "delegate" | "managed";

export interface OcrReviewerOptions {
  /**
   * delegate: a Claude Code model id (default `claude-sonnet-5-5`).
   * managed: an OpenRouter model slug (default `anthropic/claude-sonnet-5.5`).
   */
  model?: string;
  /** Default `delegate`. */
  mode?: OcrMode;
  /** Path or name of the `ocr` binary. Default `ocr`. */
  ocrCommand?: string;
  /** Path or name of the `claude` binary (delegate). Default `claude`. */
  claudeCommand?: string;
  /** Wall-clock limit for one instance. Default 20 minutes. */
  timeoutMs?: number;
  /** Delegate: `--max-budget-usd` for the claude run. Default 5. */
  maxBudgetUsd?: number;
  /** Managed: `--max-tokens-budget` for the ocr run. Default 2,000,000. */
  maxTokensBudget?: number;
  /**
   * Managed: where the OpenRouter key lives when OPENROUTER_API_KEY is not
   * set. Default `~/.config/edit-studio/openrouter.key`. The key goes to the
   * child's environment and nowhere else.
   */
  keyFile?: string;
}

export const OCR_DEFAULT_DELEGATE_MODEL = "claude-sonnet-5-5";
export const OCR_DEFAULT_MANAGED_MODEL = "anthropic/claude-sonnet-5.5";

const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;
const OPENROUTER_URL = "https://openrouter.ai/api/v1";

export function createOcrReviewer(opts: OcrReviewerOptions = {}): Reviewer {
  const mode: OcrMode = opts.mode ?? "delegate";
  const config: ResolvedOptions = {
    mode,
    model: opts.model ?? (mode === "managed" ? OCR_DEFAULT_MANAGED_MODEL : OCR_DEFAULT_DELEGATE_MODEL),
    ocrCommand: opts.ocrCommand ?? "ocr",
    claudeCommand: opts.claudeCommand ?? "claude",
    timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxBudgetUsd: opts.maxBudgetUsd ?? 5,
    maxTokensBudget: opts.maxTokensBudget ?? 2_000_000,
    keyFile: opts.keyFile ?? join(homedir(), ".config", "edit-studio", "openrouter.key"),
  };
  return {
    name: mode === "managed" ? "ocr-managed" : "ocr",
    async review(instance, repoPath, signal) {
      const started = Date.now();
      const base = { instanceId: instance.id, reviewer: mode === "managed" ? "ocr-managed" : "ocr" };
      try {
        const run =
          mode === "managed"
            ? await runManaged(instance, repoPath, config, signal)
            : await runDelegate(instance, repoPath, config, signal);
        return { ...base, ...run, durationSeconds: (Date.now() - started) / 1000 };
      } catch (err) {
        return {
          ...base,
          comments: [],
          durationSeconds: (Date.now() - started) / 1000,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}

interface ResolvedOptions {
  mode: OcrMode;
  model: string;
  ocrCommand: string;
  claudeCommand: string;
  timeoutMs: number;
  maxBudgetUsd: number;
  maxTokensBudget: number;
  keyFile: string;
}

type RunBody = Omit<ReviewerRun, "instanceId" | "reviewer" | "durationSeconds">;

// ---------------------------------------------------------------------------
// Converters (pure; covered by tests on captured output)
// ---------------------------------------------------------------------------

/** What `ocr review --format json` and the delegate skill both call a comment. */
export interface OcrComment {
  path?: unknown;
  content?: unknown;
  start_line?: unknown;
  end_line?: unknown;
}

/**
 * OCR's comment shape → the judge's. Mirrors AACR's own adapter
 * (`build_target_comments_from_ocr`): empty bodies are dropped, a missing end
 * of the range copies the other end, and a reversed range is put the right
 * way round. The body is the comment text only; `suggestion_code` and
 * `existing_code` are not shown to the judge, as in AACR's pipeline.
 */
export function convertOcrComments(raw: unknown): GeneratedComment[] {
  if (!Array.isArray(raw)) return [];
  const out: GeneratedComment[] = [];
  for (const item of raw as OcrComment[]) {
    if (!item || typeof item !== "object") continue;
    const body = typeof item.content === "string" ? item.content.trim() : "";
    if (!body) continue;
    const path = typeof item.path === "string" ? item.path : "";
    const range = normalizeRange(toLine(item.start_line), toLine(item.end_line));
    out.push({ path, ...range, body });
  }
  return out;
}

function toLine(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v >= 1 ? Math.trunc(v) : undefined;
}

function normalizeRange(from?: number, to?: number): { fromLine?: number; toLine?: number } {
  if (from === undefined && to === undefined) return {};
  const a = from ?? (to as number);
  const b = to ?? (from as number);
  return a <= b ? { fromLine: a, toLine: b } : { fromLine: b, toLine: a };
}

/** The `ocr review --format json` document, reduced to what a run needs. */
export function parseManagedOutput(stdout: string): RunBody {
  const doc = JSON.parse(stdout) as {
    status?: string;
    message?: string;
    comments?: unknown;
    summary?: { input_tokens?: number; output_tokens?: number };
  };
  if (doc.status && doc.status !== "complete" && !Array.isArray(doc.comments)) {
    throw new Error(`ocr review ended ${doc.status}${doc.message ? `: ${doc.message}` : ""}`);
  }
  return {
    comments: convertOcrComments(doc.comments),
    inputTokens: numberOrUndefined(doc.summary?.input_tokens),
    outputTokens: numberOrUndefined(doc.summary?.output_tokens),
    // OpenRouter bills per token and `ocr` reports no price; leaving it unknown
    // is more honest than multiplying by a rate that may have moved.
    costUsd: null,
  };
}

/**
 * `claude -p --output-format json` for the delegate run. The comments arrive
 * as `structured_output` (the `--json-schema` result); a model that answered in
 * prose instead gets one chance to be read from the text.
 *
 * Input tokens follow AACR's Claude convention: uncached + cache-read +
 * cache-creation, since the cache split says nothing about how much was read.
 */
export function parseDelegateOutput(stdout: string): RunBody {
  const doc = JSON.parse(stdout) as {
    is_error?: boolean;
    subtype?: string;
    result?: unknown;
    structured_output?: unknown;
    total_cost_usd?: number;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
  if (doc.is_error || (doc.subtype && doc.subtype !== "success")) {
    throw new Error(
      `claude delegate review failed (${doc.subtype ?? "error"})${
        typeof doc.result === "string" && doc.result ? `: ${doc.result.slice(0, 300)}` : ""
      }`,
    );
  }
  let payload: unknown = doc.structured_output;
  if (payload === undefined && typeof doc.result === "string") payload = extractJson(doc.result);
  const comments = (payload as { comments?: unknown } | undefined)?.comments;
  if (!Array.isArray(comments)) {
    throw new Error("claude delegate review returned no structured comments");
  }
  const u = doc.usage ?? {};
  return {
    comments: convertOcrComments(comments),
    inputTokens:
      (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
    outputTokens: u.output_tokens,
    costUsd: typeof doc.total_cost_usd === "number" ? doc.total_cost_usd : null,
  };
}

function numberOrUndefined(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced ? fenced[1] : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Delegate mode
// ---------------------------------------------------------------------------

const DELEGATE_SCHEMA = {
  type: "object",
  properties: {
    comments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
          start_line: { type: "integer" },
          end_line: { type: "integer" },
          category: { type: "string" },
          severity: { type: "string" },
        },
        required: ["path", "content"],
      },
    },
    summary: {
      type: "object",
      properties: {
        total_files: { type: "integer" },
        reviewed_files: { type: "integer" },
        skipped_files: { type: "integer" },
      },
    },
  },
  required: ["comments"],
} as const;

export function buildDelegatePrompt(baseCommit: string, headCommit: string): string {
  return [
    "Run the open-code-review-delegate skill (OpenCodeReview delegation mode) on the committed range",
    `--from ${baseCommit} --to ${headCommit} of the repository in the current directory.`,
    "Follow the skill workflow exactly: preview, rules, diffs, then review every reviewable file.",
    "The working tree may not be at the head commit, so read file context with `git show <ref>:<path>`.",
    "Run one command per Bash call and write the commit ids out literally; compound commands and shell variables are not permitted.",
    "Do not modify any file and do not fix anything.",
    "Your final answer must be the structured result: one entry per comment (path, content, start_line and end_line in the new file, category, severity) plus the coverage summary.",
  ].join(" ");
}

async function runDelegate(
  instance: AacrInstance,
  repoPath: string,
  opts: ResolvedOptions,
  signal?: AbortSignal,
): Promise<RunBody> {
  const pluginDir = await mkdtemp(join(tmpdir(), "komodo-ocr-plugin-"));
  try {
    await writePlugin(pluginDir);
    const args = [
      "-p",
      buildDelegatePrompt(instance.baseCommit, instance.headCommit),
      "--model",
      opts.model,
      "--output-format",
      "json",
      "--json-schema",
      JSON.stringify(DELEGATE_SCHEMA),
      "--plugin-dir",
      pluginDir,
      // The user's MCP servers, hooks and permissions are not part of the
      // comparison; only the project's own settings apply.
      "--strict-mcp-config",
      "--setting-sources",
      "project",
      "--permission-mode",
      "dontAsk",
      "--allowedTools",
      "Bash(ocr:*)",
      "Bash(git:*)",
      "Read",
      "Grep",
      "Glob",
      "--disallowedTools",
      "Edit",
      "Write",
      "--no-session-persistence",
      "--max-budget-usd",
      String(opts.maxBudgetUsd),
    ];
    const { stdout } = await exec(opts.claudeCommand, args, {
      cwd: repoPath,
      env: withOcrOnPath(process.env, opts.ocrCommand),
      timeoutMs: opts.timeoutMs,
      signal,
    });
    return parseDelegateOutput(stdout);
  } finally {
    await rm(pluginDir, { recursive: true, force: true });
  }
}

async function writePlugin(dir: string): Promise<void> {
  await mkdir(join(dir, ".claude-plugin"), { recursive: true });
  await mkdir(join(dir, "commands"), { recursive: true });
  await mkdir(join(dir, "skills", "open-code-review-delegate"), { recursive: true });
  await writeFile(join(dir, ".claude-plugin", "plugin.json"), OCR_PLUGIN_JSON);
  await writeFile(join(dir, "commands", "delegate-review.md"), OCR_DELEGATE_COMMAND_MD);
  await writeFile(join(dir, "skills", "open-code-review-delegate", "SKILL.md"), OCR_DELEGATE_SKILL_MD);
}

/** The skill shells out to a bare `ocr`; make an absolute --ocr-command visible to it. */
function withOcrOnPath(env: NodeJS.ProcessEnv, ocrCommand: string): NodeJS.ProcessEnv {
  if (!isAbsolute(ocrCommand)) return env;
  return { ...env, PATH: [dirname(ocrCommand), env.PATH].filter(Boolean).join(delimiter) };
}

// ---------------------------------------------------------------------------
// Managed mode
// ---------------------------------------------------------------------------

async function runManaged(
  instance: AacrInstance,
  repoPath: string,
  opts: ResolvedOptions,
  signal?: AbortSignal,
): Promise<RunBody> {
  const key = await loadKey(opts.keyFile);
  // A throwaway HOME keeps a stray ~/.opencodereview/config.json (which would
  // outrank these variables) and any global OCR rules out of the run.
  const home = await mkdtemp(join(tmpdir(), "komodo-ocr-home-"));
  try {
    const args = [
      "review",
      "--repo",
      repoPath,
      "--from",
      instance.baseCommit,
      "--to",
      instance.headCommit,
      "--format",
      "json",
      "--audience",
      "agent",
      "--concurrency",
      "8",
      "--timeout",
      String(Math.max(1, Math.ceil(opts.timeoutMs / 60_000))),
      // ocr clamps anything below 50 to 50; ask for what it will do.
      "--max-tools",
      "50",
      "--max-tokens-budget",
      String(opts.maxTokensBudget),
    ];
    const { stdout } = await exec(opts.ocrCommand, args, {
      cwd: repoPath,
      env: {
        ...process.env,
        HOME: home,
        OCR_LLM_URL: OPENROUTER_URL,
        OCR_LLM_TOKEN: key,
        OCR_LLM_MODEL: opts.model,
        OCR_LLM_PROTOCOL: "openai",
      },
      timeoutMs: opts.timeoutMs + 5 * 60_000,
      signal,
    });
    return parseManagedOutput(stdout);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

async function loadKey(keyFile: string): Promise<string> {
  const fromEnv = process.env.OPENROUTER_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  try {
    const key = (await readFile(keyFile, "utf8")).trim();
    if (key) return key;
  } catch {
    // fall through to the one error below
  }
  throw new Error(`ocr managed mode needs OPENROUTER_API_KEY or a key file at ${keyFile}`);
}

// ---------------------------------------------------------------------------
// Process helper
// ---------------------------------------------------------------------------

interface ExecOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  signal?: AbortSignal;
}

function exec(command: string, args: string[], o: ExecOptions): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: o.cwd,
      env: o.env,
      stdio: ["ignore", "pipe", "pipe"],
      signal: o.signal,
      timeout: o.timeoutMs,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d));
    child.stderr.on("data", (d: Buffer) => (stderr += d));
    child.on("error", (err) => reject(err));
    child.on("close", (code, sig) => {
      if (code === 0) resolve({ stdout, stderr });
      else {
        // stdout of a failed `claude -p` is still a JSON error document, which
        // says more than the exit code; keep both short and free of the key.
        const detail = (stderr || stdout).trim().slice(-400);
        reject(
          new Error(
            `${command} exited ${code ?? `by ${sig}`}${detail ? `: ${redact(detail, o.env)}` : ""}`,
          ),
        );
      }
    });
  });
}

function redact(text: string, env: NodeJS.ProcessEnv): string {
  const token = env.OCR_LLM_TOKEN;
  return token ? text.split(token).join("[redacted]") : text;
}
