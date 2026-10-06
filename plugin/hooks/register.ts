import { atom, read, update } from "claude-code";
import type { EngineInterface, ProcessRunInit, Register } from "claude-code";

import type { KomodoJob } from "../types";

/**
 * Komodo inside Claude Code.
 *
 * The skill asks the model to claim a job, check out its head, compare SHAs,
 * write JSON to a temp file and submit it — six chances to drift. This module
 * does the mechanical half in code: `/komodo-claim` claims and checks out, and
 * the result comes back through a `submit_review` tool whose input schema *is*
 * the ReviewResult schema, so it is validated at the boundary instead of after
 * the fact. Every decision still belongs to `komodo-review`; this file only
 * carries arguments to it and its answers back.
 *
 * It never approves anything (AGENTS.md rule 15). The brief it submits is the
 * same one `komodo-review submit` stores; a person still verifies the result
 * and presses the separate approve button in Komodo.
 */

const job = atom({ plugin: "komodo", key: "job" } as const, null);
const SUBMIT = "submit_review";
const SUBMIT_TOOL = "mcp__komodo__submit_review";

type Cli = { ok: true; stdout: string } | { ok: false; error: string };
type ClaimOutput =
  | { claimPath: null }
  | {
      claimPath: string;
      claim: { repoId: string; number: number; title: string; url: string; headSha: string };
      leaseExpiresAt: number;
    };
type PromptOutput = { prompt: string; schema: Record<string, unknown> };
type SubmitOutput = { reviewId: string; url?: string; recordPath: string };

export const register: Register = (on, options) => {
  // The manifest's default pins the CLI to this plugin's own release, so the
  // flags this module passes exist in the binary that receives them;
  // scripts/check-release.mjs holds the two to one version.
  const command = String(options.cli ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  on("session.start", async ($, e, next) => {
    await $.command.register({
      name: "komodo-claim",
      description: "Claim one Komodo review job, check out its head and start the review",
      argumentHint: "[claim.json]",
    });
    await $.command.register({
      name: "komodo-job",
      description: "Show the claimed Komodo job, or forget it",
      argumentHint: "[forget]",
    });

    // After a reload the job survives in $.state; the tool does not.
    const active = await read($, job);
    if (active) await offerSubmit($, active.schema);
    await showLease($);
    $.clock.every(60_000, () => void showLease($));

    return next(e);
  });

  on("command.run", { command: "komodo-claim" }, async ($, e) => {
    const current = await read($, job);
    if (current) {
      return {
        text: `Already reviewing ${label(current)}. Finish it with submit_review, or run /komodo-job forget.`,
      };
    }

    if (command.length === 0) {
      return { text: "Set the komodo-review command first: /plugin configure komodo@komodo." };
    }

    const claimArg = e.args.trim();
    const claimed = await cli(
      $,
      command,
      claimArg ? ["checkout", claimArg, "--json"] : ["claim", "--checkout", "--json"],
      { timeoutMs: 300_000 },
    );
    if (!claimed.ok) return { text: claimed.error };
    const out = parseJson<ClaimOutput>(claimed.stdout);
    if (!out) return { text: `komodo-review printed something that is not a claim:\n${claimed.stdout}` };
    if (out.claimPath === null) return { text: "No AI review job is queued." };

    const prompted = await cli($, command, ["prompt", "--json"]);
    const brief = prompted.ok ? parseJson<PromptOutput>(prompted.stdout) : null;
    if (!brief) {
      const why = prompted.ok ? "it printed something that is not a prompt" : prompted.error;
      return {
        text: `Claimed and checked out ${out.claim.repoId}#${out.claim.number}, but could not build the review prompt: ${why}\nRun /komodo-claim ${out.claimPath} to try again.`,
      };
    }

    const active: KomodoJob = {
      claimPath: out.claimPath,
      repoId: out.claim.repoId,
      number: out.claim.number,
      title: out.claim.title,
      url: out.claim.url,
      headSha: out.claim.headSha,
      leaseExpiresAt: out.leaseExpiresAt,
      schema: brief.schema,
    };
    await offerSubmit($, brief.schema);
    await update($, job, () => active);
    await showLease($);

    // The prompt rides as context the model reads and the transcript does not
    // print; the visible prompt is one line. A command.run hook cannot submit
    // a prompt itself (it would wait on the turn the hook holds), so a timer
    // queues it once this command has returned.
    $.clock.after(0, () => void startReview($, active));

    return {
      text: `Claimed ${label(active)} — ${active.title}\nChecked out ${active.headSha.slice(0, 12)}. The review starts now.`,
      context: [reviewInstruction(active, brief.prompt)],
    };
  });

  on("command.run", { command: "komodo-job" }, async ($, e) => {
    const active = await read($, job);
    if (e.args.trim() === "forget") {
      await update($, job, () => null);
      $.ui.status(undefined);
      return {
        text: active
          ? `Forgot ${label(active)}. Its lease still runs until it expires; the claim file is ${active.claimPath}.`
          : "No Komodo job was claimed.",
      };
    }
    if (!active) return { text: "No Komodo job is claimed in this session. Run /komodo-claim." };
    return {
      text: `${label(active)} — ${active.title}\nHead ${active.headSha.slice(0, 12)} · claim ${active.claimPath}`,
    };
  });

  on("tool.call", { tool: SUBMIT_TOOL }, async ($, e) => {
    const active = await read($, job);
    if (!active) {
      return { deny: "No Komodo job is claimed in this session. Ask the person to run /komodo-claim." };
    }

    const { tool: _tool, tool_use_id: _id, consent: _consent, agentId: _agent, ...result } =
      e as Record<string, unknown>;
    const ran = await cli($, command, ["submit", active.claimPath, "-", "--json"], {
      stdin: JSON.stringify(result),
      timeoutMs: 180_000,
    });
    if (!ran.ok) {
      return {
        deny: `komodo-review refused this result. Correct it and call submit_review again.\n\n${ran.error}`,
      };
    }

    const done = parseJson<SubmitOutput>(ran.stdout);
    await update($, job, () => null);
    $.ui.status(undefined);
    const where = done?.url ?? done?.recordPath ?? "the Komodo queue";
    return {
      result: `Submitted ${label(active)} as review ${done?.reviewId ?? "(id not printed)"}: ${where}. Tell the person where it is. The result checks still need a person to run them, and approving stays a separate decision in Komodo.`,
    };
  });
};

async function cli(
  $: EngineInterface,
  command: readonly string[],
  args: string[],
  init: ProcessRunInit = {},
): Promise<Cli> {
  const argv = [...command, ...args];
  try {
    // NODE_NO_WARNINGS: node:sqlite's experimental warning would otherwise
    // be the first line of every refusal shown to the person.
    const ran = await $.process.run(argv, {
      timeoutMs: 120_000,
      ...init,
      env: { NODE_NO_WARNINGS: "1", ...init.env },
    });
    if (ran.exitCode === 0) return { ok: true, stdout: ran.stdout };
    return {
      ok: false,
      error: ran.stderr.trim() || ran.stdout.trim() || `${argv.join(" ")} exited ${ran.exitCode}.`,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Could not run ${argv.join(" ")}: ${detail}` };
  }
}

async function showLease($: EngineInterface): Promise<void> {
  const active = await read($, job);
  if (!active) return $.ui.status(undefined);
  const left = Math.max(0, active.leaseExpiresAt - (await $.clock.now()));
  const minutes = Math.floor(left / 60_000);
  const time = left === 0 ? "lease expired" : `${Math.floor(minutes / 60)}h ${minutes % 60}m left`;
  $.ui.status(`Komodo · ${label(active)} · ${time}`);
}

function offerSubmit($: EngineInterface, schema: Record<string, unknown>) {
  return $.tool.register({
    name: SUBMIT,
    description:
      "Submit the finished Komodo review brief for the claimed job. The input is the ReviewResult itself. Call it once, when the review is complete; if it is refused, correct the input and call it again.",
    inputSchema: schema,
  });
}

async function startReview($: EngineInterface, active: KomodoJob): Promise<void> {
  try {
    await $.prompt.submit({
      text: `Review the Komodo job claimed above (${label(active)}) and finish with submit_review.`,
    });
  } catch {
    $.ui.toast(`Komodo: ${label(active)} is checked out. Send any message to start the review.`);
  }
}

const label = (j: Pick<KomodoJob, "repoId" | "number">) => `${j.repoId}#${j.number}`;

/** The last line of a command's output as JSON: the CLI's `--json` modes print exactly one. */
function parseJson<T>(text: string): T | null {
  try {
    return JSON.parse(text.trim().split("\n").at(-1) ?? "") as T;
  } catch {
    return null;
  }
}

function reviewInstruction(active: KomodoJob, prompt: string): string {
  return `You are reviewing ${label(active)} for Komodo. The working tree is checked out at ${active.headSha}.

Follow the review prompt below exactly. Use Read, Glob and Grep on the surrounding code to judge architectural fit, scope and test adequacy. Drop any judgement you cannot substantiate. Do not claim to have run, seen or verified behaviour unless you did, and never turn an empty finding list into a merge recommendation.

When the review is complete, call the submit_review tool once with the ReviewResult as its input. Do not write the result to a file. If the tool refuses it, read the reason, correct the input and call it again. Do not describe the review as submitted until the tool says it was.

${prompt}`;
}
