import { query } from "@anthropic-ai/claude-agent-sdk";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resultUsage } from "../providers/claude.js";
import { sha256 } from "./dataset.js";

/**
 * One judge call: a generated comment against every reference comment on the
 * same file. Line strings are `"<from>-<to>"`, or `"?"` when either end is
 * missing, as `evaluate_file_level_semantics` formats them.
 */
export interface JudgeCall {
  path: string;
  genNote: string;
  genLines: string;
  refNotes: string[];
  refLines: string[];
}

export interface JudgeVerdict {
  /** 1-based positions in `refNotes`, as the judge returned them. */
  matched: number[];
  /** The judge's whole answer, or why there is none. */
  reason: string;
  /** True when no answer could be had; the call then counts as no match, as upstream. */
  error?: boolean;
}

export type JudgeFn = (call: JudgeCall) => Promise<JudgeVerdict>;

/**
 * `match_llm_file_level`'s prompt, character for character. The official
 * evaluator is the reference for what "covered" means, so any edit here makes
 * Komodo's numbers incomparable with published ones.
 */
export function buildJudgePrompt(call: JudgeCall): string {
  const numberedRefs = call.refNotes
    .map((note, i) => `${i + 1}. [L${call.refLines[i]}] ${note}`)
    .join("\n");
  return `
-Role-

You are an expert code reviewer comparing review comments for semantic equivalence.

-Task-

Given a Generated Comment and a numbered list of Reference Comments (all from the same file: ${call.path}), determine which Reference Comments express the same concern or suggestion as the Generated Comment.

Focus solely on semantic equivalence of the underlying issue — ignore differences in wording, tone, formatting, or exact line numbers. If the Generated Comment addresses the same core problem as a Reference Comment, include that Reference Comment's number.

-Generated Comment-
[L${call.genLines}] ${call.genNote}

-Reference Comments-
${numberedRefs}

-Output-

For each Reference Comment, briefly state whether it matches and why (one line each).
Then return a JSON array of matched numbers on the LAST line. If none match, return [].

Example:
1. Match — both flag the uninitialized variable risk
2. No match — ref discusses naming, generated discusses null check
3. Match — same concern about missing error handling

[1, 3]

Your answer:
`;
}

/**
 * The upstream parse: the last `[...]` made of digits, commas and whitespace,
 * read as JSON, keeping integers in 1..refCount. A bracket that is not valid
 * JSON (`[1,,2]`) raises upstream and is caught as "no match" with the error
 * as the reason — so it returns `invalid` here, and the caller records it the
 * same way. `\p{Nd}` because Python's `\d` matches any decimal digit.
 */
export function readJudgeAnswer(text: string, refCount: number): { matched: number[]; invalid?: string } {
  const matches = text.trim().match(/\[[\p{Nd},\s]*\]/gu);
  if (!matches) return { matched: [] };
  const last = matches[matches.length - 1];
  let parsed: unknown;
  try {
    parsed = JSON.parse(last);
  } catch (err) {
    return { matched: [], invalid: `${last}: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!Array.isArray(parsed)) return { matched: [] };
  return {
    matched: parsed.filter(
      (i): i is number => typeof i === "number" && Number.isInteger(i) && i >= 1 && i <= refCount,
    ),
  };
}

/** The covered reference numbers in a judge answer; see `readJudgeAnswer`. */
export function parseJudgeAnswer(text: string, refCount: number): number[] {
  return readJudgeAnswer(text, refCount).matched;
}

/** A verdict from an answer, with upstream's reason for one it could not read. */
function verdictFrom(answer: string, refCount: number): JudgeVerdict {
  const read = readJudgeAnswer(answer, refCount);
  return { matched: read.matched, reason: read.invalid ? `judge error: unreadable answer ${read.invalid}` : answer.trim() };
}

/** A model the judge can ask one question of. */
export interface JudgeModel {
  /** Recorded with every cached answer: an answer is only reused by the same model. */
  readonly name: string;
  complete(prompt: string): Promise<{
    text: string;
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
  }>;
}

/**
 * The judge on Claude, through the Agent SDK like every other Komodo model
 * call: no tools, one turn, no settings or project files loaded, run from an
 * empty directory so nothing about the machine leaks into the question.
 *
 * Plain text rather than structured output on purpose. The prompt asks for a
 * line per reference and then the array; constraining the answer to a schema
 * would change what the model is asked to do, and the judge exists to ask
 * exactly what AACR-Bench asks.
 */
export class ClaudeJudgeModel implements JudgeModel {
  readonly name: string;
  private readonly executable?: string;
  private readonly cwd: string;

  constructor(opts: { model?: string; executable?: string } = {}) {
    this.name = opts.model ?? "claude-sonnet-5-5";
    this.executable = opts.executable;
    this.cwd = mkdtempSync(join(tmpdir(), "komodo-aacr-judge-"));
  }

  async complete(prompt: string) {
    let text = "";
    let usage: ReturnType<typeof resultUsage> = {};
    for await (const message of query({
      prompt,
      options: {
        model: this.name,
        ...(this.executable ? { pathToClaudeCodeExecutable: this.executable } : {}),
        cwd: this.cwd,
        tools: [],
        allowedTools: [],
        settingSources: [],
        maxTurns: 1,
        systemPrompt: "Answer the user's question exactly as instructed.",
      } as any,
    })) {
      const m = message as any;
      if (m.type !== "result") continue;
      usage = resultUsage(m);
      if (m.subtype && m.subtype !== "success") throw new Error(`Judge call failed (${m.subtype}).`);
      text = typeof m.result === "string" ? m.result : "";
    }
    return { text, ...usage };
  }
}

export interface JudgeStats {
  calls: number;
  cached: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface CachedJudge {
  judge: JudgeFn;
  stats: JudgeStats;
}

/**
 * Wraps a model as a `JudgeFn` with the upstream concurrency cap (3), a retry
 * for transient failures, and an answer cache in `cacheDir` keyed by model
 * and prompt — so re-scoring a run costs nothing. The raw answer is cached,
 * not the parse, so a parser fix applies to old answers. Failures are never
 * cached: the next score asks again.
 */
export function createCachedJudge(
  model: JudgeModel,
  opts: { cacheDir?: string; concurrency?: number; retries?: number } = {},
): CachedJudge {
  const stats: JudgeStats = { calls: 0, cached: 0, errors: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
  const limit = createLimiter(opts.concurrency ?? 3);
  const retries = opts.retries ?? 2;
  if (opts.cacheDir) mkdirSync(opts.cacheDir, { recursive: true });

  const judge: JudgeFn = async (call) => {
    const prompt = buildJudgePrompt(call);
    const key = sha256(JSON.stringify({ model: model.name, prompt }));
    const file = opts.cacheDir ? join(opts.cacheDir, `${key}.json`) : null;
    if (file && existsSync(file)) {
      const hit = JSON.parse(readFileSync(file, "utf8")) as { answer: string };
      stats.cached++;
      return verdictFrom(hit.answer, call.refNotes.length);
    }
    return limit(async () => {
      let lastError = "";
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          stats.calls++;
          const out = await model.complete(prompt);
          stats.inputTokens += out.inputTokens ?? 0;
          stats.outputTokens += out.outputTokens ?? 0;
          stats.costUsd += out.costUsd ?? 0;
          if (file) {
            const partial = `${file}.${process.pid}.part`;
            writeFileSync(partial, JSON.stringify({ model: model.name, answer: out.text }));
            renameSync(partial, file);
          }
          return verdictFrom(out.text, call.refNotes.length);
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
        }
      }
      stats.errors++;
      return { matched: [], reason: `judge error: ${lastError}`, error: true };
    });
  };
  return { judge, stats };
}

/** At most `n` of the returned function's tasks run at once. */
export function createLimiter(n: number): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async (task) => {
    // A finishing task hands its slot straight to the next waiter, so a
    // caller arriving in between cannot take it as well.
    if (active >= n) await new Promise<void>((resolve) => waiting.push(resolve));
    else active++;
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}
