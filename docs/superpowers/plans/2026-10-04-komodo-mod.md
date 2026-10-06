# Komodo mod for Claude Code — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Claude Code *mod* inside the existing `komodo` plugin so a queue
review is claimed, checked out and submitted by code instead of by the model
following a skill's shell choreography — then build on that seam for evidence,
context, and status.

**Architecture:** The mod (`plugin/hooks/register.ts`) is a thin client. It never
re-implements review logic: every decision (claiming, head checks, schema
validation, storing) stays in the `komodo-review` CLI, which the mod reaches
through `$.process.run`. The CLI grows machine-readable modes (`--json`,
`--checkout`, stdin results) that the skill's manual path can use too, so hosts
without mods (VS Code chat panel, `claude -p`, Cursor) keep working unchanged.

**Tech Stack:** Claude Code mods API (Claude Code ≥ 2.1.287, `claude-code` types),
TypeScript, commander, zod v4, vitest.

---

## Constraints every phase inherits

These come from `AGENTS.md` and are not negotiable:

- **Rule 15 — the reviewer never approves.** The mod must not call, wrap, or
  link to `submitHumanReview`, and must not draw an "approve" control anywhere.
  It submits a *review brief* through the same path `komodo-review submit`
  already uses.
- **Rule 15 — evidence is honest.** Anything the mod records about what the
  agent ran is labelled as such and is never written as a verification entry.
  It cannot satisfy a required check.
- **Rule 1 — the store port is the contract.** Any phase that persists something
  new adds a port method, implements it in SQLite *and* Postgres, and covers it
  in `packages/store/test/conformance.ts` in the same commit.
- **Rule 3 — a field has a reader.** Nothing is captured that no screen shows.
- **Rule 13 — user-supplied paths are checked.** The mod passes a claim path the
  person typed to the CLI, which parses it through `ClaimSchema` before use.
- **Mods are not sandboxed.** The mod hooks no permission events and never
  auto-approves a tool call.
- **Mods are early access.** Keep the module small; when the API moves, only
  `plugin/hooks/` should need to change.

## Roadmap

| Phase | What ships | Plan |
| --- | --- | --- |
| 1 | `/komodo-claim`, `submit_review` tool, `/komodo-job`, lease status line, CLI `--json`/`--checkout`/stdin | **This document, in full** |
| 2 | "What the agent ran at `<sha>`" ledger, end-to-end (mod → CLI → record → port → both drivers → review page) | Own plan, written before starting |
| 3 | Komodo context in the authoring session (`prompt.compose`) and an opt-in preflight band | Own plan |
| 4 | Watch toasts (new comment on a watched PR) | Own plan |
| 5 | Read-only queue pane | Own plan, only if Phases 1–3 prove the surface |

Phases 2–5 are scoped at the end of this document so their shape is settled
now; each gets a full task-by-task plan when it starts, because each crosses a
different subsystem (store, prompt, ingest, UI).

---

# Phase 1 — Deterministic claim and submit

## File structure

| File | Responsibility |
| --- | --- |
| `packages/core/src/diff-sources/local-git.ts` | Export `repoFromRemoteUrl` (extracted, behaviour unchanged) |
| `packages/core/test/remote-url.test.ts` | Tests for it |
| `packages/cli/src/claim-file.ts` | `ClaimSchema`, `readClaimFile`, `ClaimOutput` — shared by claim/checkout/submit |
| `packages/cli/src/checkout.ts` | `checkoutRefusal` (pure) + `checkoutClaim` (git side effects) |
| `packages/cli/test/checkout.test.ts` | Tests for `checkoutRefusal` |
| `packages/cli/src/commands/checkout.ts` | `komodo-review checkout <claim> [--json]` |
| `packages/cli/src/commands/claim.ts` | `--checkout`, `--json` |
| `packages/cli/src/commands/prompt.ts` | `--json` → `{ prompt, schema }` |
| `packages/cli/src/commands/submit.ts` | result from stdin (`-`), `--json` |
| `packages/cli/src/index.ts` | Wire the flags and the new command |
| `packages/cli/package.json` | vitest |
| `plugin/.claude-plugin/plugin.json` | `userConfig.cli`, `types` |
| `plugin/hooks/hooks.json` | Points at the module |
| `plugin/hooks/register.ts` | The mod |
| `plugin/types/index.d.ts` | `$.state` contract |
| `plugin/hooks/register.test.ts` | `claude plugin test` suite |
| `plugin/skills/komodo-review/SKILL.md` | Prefer `/komodo-claim` when present |
| `package.json` | `test:plugin` script |

---

### Task 1: Extract `repoFromRemoteUrl` in core

**Files:**
- Modify: `packages/core/src/diff-sources/local-git.ts`
- Modify: `packages/core/src/diff-sources/index.ts`
- Test: `packages/core/test/remote-url.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/test/remote-url.test.ts
import { describe, expect, it } from "vitest";

import { repoFromRemoteUrl } from "../src/diff-sources/local-git.js";

describe("reading owner/repo out of a git remote", () => {
  it("reads an https remote", () => {
    expect(repoFromRemoteUrl("https://github.com/Delavalom/komodo.git")).toEqual({
      owner: "Delavalom",
      repo: "komodo",
    });
  });

  it("reads an ssh remote", () => {
    expect(repoFromRemoteUrl("git@github.com:Delavalom/komodo.git")).toEqual({
      owner: "Delavalom",
      repo: "komodo",
    });
  });

  it("reads a remote with no .git suffix", () => {
    expect(repoFromRemoteUrl("https://github.com/Delavalom/komodo")).toEqual({
      owner: "Delavalom",
      repo: "komodo",
    });
  });

  it("answers null for something that is not a remote", () => {
    expect(repoFromRemoteUrl("komodo")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm -C packages/core exec vitest run test/remote-url.test.ts`
Expected: FAIL — `repoFromRemoteUrl` is not exported.

- [ ] **Step 3: Extract the function**

In `packages/core/src/diff-sources/local-git.ts`, add above the class:

```ts
/**
 * `owner/repo` out of a git remote URL, https or ssh, or null.
 *
 * The same reading `getMeta` has always done, pulled out so that a command
 * checking a checkout against a claim reads the remote exactly as the record
 * that claim produces will.
 */
export function repoFromRemoteUrl(remote: string): { owner: string; repo: string } | null {
  const m = /[:/]([^/]+)\/([^/.]+?)(?:\.git)?$/.exec(remote);
  if (!m?.[1] || !m[2]) return null;
  return { owner: m[1], repo: m[2] };
}
```

and replace the inline regex in `getMeta`:

```ts
    const remote = this.gitOptional(["remote", "get-url", "origin"]);
    const parsed = remote ? repoFromRemoteUrl(remote) : null;
    if (parsed) {
      owner = parsed.owner;
      repo = parsed.repo;
    }
```

In `packages/core/src/diff-sources/index.ts`:

```ts
export { LocalGitDiffSource, repoFromRemoteUrl } from "./local-git.js";
```

- [ ] **Step 4: Run the tests**

Run: `pnpm -C packages/core exec vitest run`
Expected: PASS, including the existing diff tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/diff-sources packages/core/test/remote-url.test.ts
git commit -m "refactor(core): export repoFromRemoteUrl"
```

---

### Task 2: Shared claim file module in the CLI

**Files:**
- Create: `packages/cli/src/claim-file.ts`
- Modify: `packages/cli/src/commands/submit.ts` (remove `LocalClaimSchema`, `ClaimSchema`, `readJson`; import them)

- [ ] **Step 1: Create `claim-file.ts`**

```ts
// packages/cli/src/claim-file.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

import { INTERACTIVE_LEASE_MS, RemoteClaimSchema } from "@komodo/core";

const LocalClaimSchema = z.object({
  version: z.literal(1),
  database: z.string().min(1),
  workerId: z.string().min(1),
  jobId: z.string().min(1),
  headSha: z.string().min(1),
  prId: z.string().min(1),
  repoId: z.string().min(1),
  number: z.number().int().positive(),
  url: z.string(),
  title: z.string(),
  author: z.string(),
  claimedAt: z.number(),
});

/**
 * Either kind of claim.
 *
 * `database` and `host` are what tell them apart, and the union is discriminated
 * on which one is present rather than on a `kind` field — the local shape was
 * already on disk in other people's working directories before the remote one
 * existed, and it has to keep parsing.
 */
export const ClaimSchema = z.union([LocalClaimSchema, RemoteClaimSchema]);
export type Claim = z.infer<typeof ClaimSchema>;

/**
 * What `claim --json` and `checkout --json` print: one line a program can read.
 *
 * `claimPath` is null when nothing was queued. `leaseExpiresAt` is computed
 * here so a caller showing time left never carries its own copy of the lease.
 */
export type ClaimOutput =
  | { claimPath: null }
  | { claimPath: string; claim: Claim; leaseExpiresAt: number; checkedOut: boolean };

export function claimOutput(claimPath: string, claim: Claim, checkedOut: boolean): ClaimOutput {
  return { claimPath, claim, leaseExpiresAt: claim.claimedAt + INTERACTIVE_LEASE_MS, checkedOut };
}

/** A claim file, parsed. A path somebody typed goes through the schema before anything uses it. */
export function readClaimFile(path: string): Claim {
  return ClaimSchema.parse(readJson(resolve(path)));
}

export function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read JSON from ${path}: ${detail}`);
  }
}
```

- [ ] **Step 2: Point `submit.ts` at it**

Delete `LocalClaimSchema`, `ClaimSchema` and `readJson` from `submit.ts`, drop the
now-unused `z` and `RemoteClaimSchema` imports, and add:

```ts
import { readClaimFile, readJson } from "../claim-file.js";
```

Replace `const claim = ClaimSchema.parse(readJson(resolve(claimPath)));` with
`const claim = readClaimFile(claimPath);`.

- [ ] **Step 3: Typecheck**

Run: `pnpm -C packages/cli typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/claim-file.ts packages/cli/src/commands/submit.ts
git commit -m "refactor(cli): share the claim file schema"
```

---

### Task 3: Checkout guard (pure) with tests

**Files:**
- Modify: `packages/cli/package.json` (vitest, real `test` script)
- Create: `packages/cli/src/checkout.ts`
- Test: `packages/cli/test/checkout.test.ts`

- [ ] **Step 1: Give the CLI a test runner**

In `packages/cli/package.json`: `"test": "vitest run"` and add
`"vitest": "^3.0.0"` to `devDependencies`. Run `pnpm install`.

- [ ] **Step 2: Write the failing test**

```ts
// packages/cli/test/checkout.test.ts
import { describe, expect, it } from "vitest";

import { checkoutRefusal } from "../src/checkout.js";

const claim = { repoId: "acme/api", claimPath: "/tmp/claim.json" };

describe("whether this checkout may take the claimed head", () => {
  it("allows a clean clone of the claimed repository", () => {
    expect(
      checkoutRefusal({ ...claim, origin: "git@github.com:acme/api.git", porcelain: "" }),
    ).toBeNull();
  });

  it("matches the repository without regard to case, as GitHub does", () => {
    expect(
      checkoutRefusal({ ...claim, origin: "https://github.com/Acme/API.git", porcelain: "" }),
    ).toBeNull();
  });

  it("refuses a clone of a different repository, and says where to go", () => {
    const refusal = checkoutRefusal({
      ...claim,
      origin: "https://github.com/acme/web.git",
      porcelain: "",
    });
    expect(refusal).toMatch(/acme\/api/);
    expect(refusal).toMatch(/acme\/web/);
    expect(refusal).toMatch(/komodo-review checkout \/tmp\/claim\.json/);
  });

  it("refuses a directory with no origin", () => {
    expect(checkoutRefusal({ ...claim, origin: null, porcelain: "" })).toMatch(/origin/);
  });

  it("refuses tracked changes, which would ride into the review", () => {
    expect(
      checkoutRefusal({ ...claim, origin: "git@github.com:acme/api.git", porcelain: " M src/a.ts" }),
    ).toMatch(/uncommitted/);
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `pnpm -C packages/cli test`
Expected: FAIL — cannot find `../src/checkout.js`.

- [ ] **Step 4: Implement**

```ts
// packages/cli/src/checkout.ts
import { execFileSync } from "node:child_process";

import { repoFromRemoteUrl } from "@komodo/core";

import type { Claim } from "./claim-file.js";

/**
 * Why this directory must not take the claimed head, or null when it may.
 *
 * Pure, so the three refusals are tested without a repository. Each one names
 * the command to run once the person has fixed it, because by the time this
 * runs the job is already claimed and its lease is ticking.
 */
export function checkoutRefusal(input: {
  repoId: string;
  claimPath: string;
  origin: string | null;
  porcelain: string;
}): string | null {
  const retry = `komodo-review checkout ${input.claimPath}`;
  if (!input.origin) {
    return `This directory has no \`origin\` remote, so it cannot be checked against ${input.repoId}. Open a clone of ${input.repoId} and run \`${retry}\`.`;
  }
  const parsed = repoFromRemoteUrl(input.origin);
  const here = parsed ? `${parsed.owner}/${parsed.repo}` : input.origin;
  if (here.toLowerCase() !== input.repoId.toLowerCase()) {
    return `The claim is for ${input.repoId}, but this checkout is ${here}. Open a clone of ${input.repoId} and run \`${retry}\`.`;
  }
  if (input.porcelain.trim()) {
    return `This checkout has uncommitted changes, and checking out the claimed head would carry them into the review. Commit or stash them, then run \`${retry}\`.`;
  }
  return null;
}

/**
 * Detach this checkout at exactly the claimed head.
 *
 * Fetched from `refs/pull/<n>/head` on origin rather than through `gh pr
 * checkout`, so it needs no GitHub CLI and lands on the claimed SHA even when
 * the pull request has moved since: a newer head is not the one the claim
 * leased, and `submit` refuses anything else.
 */
export function checkoutClaim(claim: Claim, claimPath: string, cwd = process.cwd()): void {
  const git = (args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const optional = (args: string[]) => {
    try {
      return git(args);
    } catch {
      return null;
    }
  };

  const refusal = checkoutRefusal({
    repoId: claim.repoId,
    claimPath,
    origin: optional(["remote", "get-url", "origin"]),
    porcelain: optional(["status", "--porcelain", "--untracked-files=no"]) ?? "",
  });
  if (refusal) throw new Error(refusal);

  if (optional(["rev-parse", "HEAD"]) === claim.headSha) return;

  const present = () => optional(["cat-file", "-e", `${claim.headSha}^{commit}`]) !== null;
  if (!present()) optional(["fetch", "--no-tags", "origin", `refs/pull/${claim.number}/head`]);
  if (!present()) optional(["fetch", "--no-tags", "origin", claim.headSha]);
  if (!present()) {
    throw new Error(
      `Could not fetch ${claim.headSha.slice(0, 12)} from origin. The claim is at ${claimPath}; fetch that commit and run \`komodo-review checkout ${claimPath}\`.`,
    );
  }
  git(["checkout", "--quiet", "--detach", claim.headSha]);
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm -C packages/cli test`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/cli/package.json packages/cli/src/checkout.ts packages/cli/test pnpm-lock.yaml
git commit -m "feat(cli): check a checkout against a claim before taking its head"
```

---

### Task 4: `checkout` command and `claim --checkout --json`

**Files:**
- Create: `packages/cli/src/commands/checkout.ts`
- Modify: `packages/cli/src/commands/claim.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Write the command**

```ts
// packages/cli/src/commands/checkout.ts
import { resolve } from "node:path";
import pc from "picocolors";

import { checkoutClaim } from "../checkout.js";
import { claimOutput, readClaimFile } from "../claim-file.js";

/** Check out a claim's head in this directory: after a refusal, or to resume a claim. */
export async function checkoutCommand(claimPath: string, opts: { json?: boolean }): Promise<void> {
  const path = resolve(claimPath);
  const claim = readClaimFile(path);
  checkoutClaim(claim, path);

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(claimOutput(path, claim, true))}\n`);
    return;
  }
  console.log(pc.green(`Checked out ${claim.headSha.slice(0, 12)} for ${claim.repoId}#${claim.number}.`));
}
```

- [ ] **Step 2: Extend `claim`**

In `claimCommand`, take `checkout?: boolean; json?: boolean`, and replace
everything after `const claim = …` with:

```ts
  if (!claim) {
    if (opts.json) process.stdout.write(`${JSON.stringify({ claimPath: null })}\n`);
    else console.log(pc.dim("No AI review job is queued."));
    return;
  }

  const output = resolve(
    opts.out ?? join(process.cwd(), ".komodo", "claims", `${safeName(claim.jobId)}.json`),
  );
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(claim, null, 2));

  if (opts.checkout) {
    try {
      checkoutClaim(claim, output);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Claimed ${claim.repoId}#${claim.number} (claim file: ${output}), but did not check it out. ${detail}`,
      );
    }
  }

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(claimOutput(output, claim, Boolean(opts.checkout)))}\n`);
    return;
  }

  console.log(output);
  console.log(`${claim.repoId}#${claim.number} — ${claim.title}`);
  console.log(
    opts.checkout
      ? `Checked out ${claim.headSha.slice(0, 12)}. Submit with: komodo-review submit ${output} <result.json>`
      : `Check out this exact head, then submit with: komodo-review submit ${output} <result.json>`,
  );
```

Add the imports `checkoutClaim` from `../checkout.js` and `claimOutput` from
`../claim-file.js`.

- [ ] **Step 3: Wire `index.ts`**

On the `claim` command add:

```ts
  .option("--checkout", "check out the claimed head in this directory", false)
  .option("--json", "print the claim as one line of JSON", false)
```

and register:

```ts
program
  .command("checkout")
  .argument("<claim>", "claim context JSON from komodo-review claim")
  .description("Check out a claimed head in this directory")
  .option("--json", "print the claim as one line of JSON", false)
  .action(checkoutCommand);
```

- [ ] **Step 4: Typecheck and build**

Run: `pnpm -C packages/cli typecheck && pnpm -C packages/cli exec tsup`
Expected: no errors.

- [ ] **Step 5: Smoke-test against a local queue**

```bash
cd /tmp && rm -rf komodo-smoke && git clone -q https://github.com/Delavalom/komodo-playground komodo-smoke && cd komodo-smoke
node ~/delavalom-labs/komodo/packages/cli/dist/index.js claim --json
```

Expected: `{"claimPath":null}` (an empty local queue) — proves the JSON path.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src
git commit -m "feat(cli): claim --checkout --json and a checkout command"
```

---

### Task 5: `prompt --json` and `submit -` / `--json`

**Files:**
- Modify: `packages/cli/src/commands/prompt.ts`
- Modify: `packages/cli/src/commands/submit.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: `prompt --json`**

`promptCommand(opts: { base?: string; json?: boolean })`. Before the final
`process.stdout.write`, add:

```ts
  const reviewPrompt = buildReviewPrompt({ pr: meta, files, config, sharedContext: shared.docs });

  // A caller with a structured channel (the mod's submit_review tool) takes
  // the schema as the tool's input schema, so the prompt carries no
  // "write the JSON yourself" section for it to contradict.
  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ prompt: reviewPrompt, schema: reviewResultJsonSchema() })}\n`);
    return;
  }
```

and use `reviewPrompt` in the existing write. Add
`.option("--json", "print { prompt, schema } as JSON for a caller with a structured channel", false)`
to the `prompt` command in `index.ts`.

- [ ] **Step 2: `submit -` and `--json`**

In `submitCommand(claimPath, resultPath, opts: { base?; apiKey?; json? })`:

```ts
  const raw = (resultPath === "-" ? readStdinJson() : readJson(resolve(resultPath))) as { result?: unknown };
```

with

```ts
function readStdinJson(): unknown {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read a ReviewResult as JSON from standard input: ${detail}`);
  }
}
```

and a single place that reports success, used by both branches:

```ts
function reportSubmitted(json: boolean | undefined, done: { reviewId: string; url?: string; recordPath: string }) {
  if (json) {
    process.stdout.write(`${JSON.stringify(done)}\n`);
    return;
  }
  console.log(pc.green(`Review completed: ${done.reviewId}`));
  if (done.url) console.log(done.url);
  console.log(done.recordPath);
}
```

Remote branch: `reportSubmitted(opts.json, { reviewId: submitted.reviewId, url: submitted.url ?? undefined, recordPath })`.
Local branch: `reportSubmitted(opts.json, { reviewId, recordPath })`.

In `index.ts` the `submit` argument help becomes
`"ReviewResult JSON written by the interactive agent, or - for standard input"`
and gains `.option("--json", "print the outcome as one line of JSON", false)`.

- [ ] **Step 3: Typecheck, lint, build**

Run: `pnpm -C packages/cli typecheck && pnpm -C packages/cli exec tsup`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src
git commit -m "feat(cli): prompt --json, and submit from stdin with --json"
```

---

### Task 6: The mod — manifest, contract, module

**Files:**
- Modify: `plugin/.claude-plugin/plugin.json`
- Create: `plugin/hooks/hooks.json`
- Create: `plugin/types/index.d.ts`
- Create: `plugin/hooks/register.ts`

- [ ] **Step 1: Manifest**

Add to `plugin/.claude-plugin/plugin.json`:

```json
  "types": "./types/index.d.ts",
  "userConfig": {
    "cli": {
      "type": "string",
      "title": "komodo-review command",
      "description": "How to run the Komodo CLI, split on spaces. Point it at a checkout's build while developing Komodo itself.",
      "default": "npx --yes komodo-review@0.7.0"
    }
  }
```

The default is pinned to the release: unpinned, `npx` fetches whatever npm last
published, which lacks the flags this module passes. Task 8 makes
`check:release` enforce the pin.

- [ ] **Step 2: `hooks.json`**

```json
{ "modules": ["./register.ts"] }
```

- [ ] **Step 3: State contract**

```ts
// plugin/types/index.d.ts
/** The job this session claimed, from `/komodo-claim` until `submit_review` lands. */
export type KomodoJob = {
  claimPath: string;
  repoId: string;
  number: number;
  title: string;
  url: string;
  headSha: string;
  leaseExpiresAt: number;
  /** The ReviewResult JSON schema the CLI printed, re-registered after a reload. */
  schema: Record<string, unknown>;
};

declare module "claude-code" {
  interface PluginState {
    komodo: { job: KomodoJob | null };
  }
}
```

- [ ] **Step 4: The module**

Write `plugin/hooks/register.ts` (the shipped file is the reference). Two rules
the engine imposes, both found the hard way:

1. **Every helper that receives `$` is a top-level function declaration.**
   `claude plugin validate` traces `$` statically; a closure inside `register`
   that takes `$` fails validation ("`$` is passed to … which is not a function
   declared at the top of this file"). So `cli($, command, args, init)`,
   `showLease($)`, `offerSubmit($, schema)` and `startReview($, job)` live at
   module level, and `register` passes the configured `command` in.
2. **A `command.run` hook cannot call `$.prompt.submit`** — it would wait on the
   turn the hook holds, and the host rejects it. The review prompt is queued
   from `$.clock.after(0, () => void startReview($, active))`, which runs once
   the command has returned; `startReview` falls back to a toast if the submit
   is refused.

Shape of `register`:

```ts
export const register: Register = (on, options) => {
  const command = String(options.cli ?? "").trim().split(/\s+/).filter(Boolean);

  on("session.start", async ($, e, next) => {
    // register /komodo-claim and /komodo-job; re-offer submit_review if
    // $.state still holds a job after a reload; start the lease status timer
    return next(e);
  });
  on("command.run", { command: "komodo-claim" }, async ($, e) => {
    // claim --checkout --json (or checkout <arg> --json) → prompt --json →
    // offerSubmit(schema) → state.job = active → clock.after(0, startReview)
    // → { text, context: [reviewInstruction(active, prompt)] }
  });
  on("command.run", { command: "komodo-job" }, async ($, e) => { /* show | forget */ });
  on("tool.call", { tool: "mcp__komodo__submit_review" }, async ($, e) => {
    // strip tool/tool_use_id/consent/agentId; submit <claim> - --json with the
    // rest as stdin; { deny } with the CLI's refusal, else clear the job
  });
};
```

- [ ] **Step 5: Validate**

Run: `claude plugin validate plugin`
Expected: `✔ Validation passed`, with
`hooks: session.start, command.run{command=komodo-claim}, command.run{command=komodo-job}, tool.call{tool=mcp__komodo__submit_review}` and
`calls: $.clock.after, $.clock.every, $.clock.now, $.command.register, $.process.run, $.prompt.submit, $.state.get, $.state.set, $.tool.register, $.ui.status, $.ui.toast` — no permission events.

Type-check with a `tsconfig.json` kept outside the plugin (the header of the
engine's `claude-code.d.ts` has one), its `files` naming that `.d.ts` and its
`include` naming `plugin/hooks` and `plugin/types`.

- [ ] **Step 6: Commit**

```bash
git add plugin
git commit -m "feat(plugin): a mod that claims, checks out and submits a Komodo review"
```

---

### Task 7: Mod tests

**Files:**
- Create: `plugin/hooks/register.test.ts`
- Modify: `package.json` (root): `"test:plugin": "claude plugin validate plugin && claude plugin test plugin"`

CI has no `claude` binary, so this suite is a local gate (documented in the
plugin README section of `SKILL.md`), not part of `pnpm test`.

- [ ] **Step 1: Write the tests**

Nothing sits beneath a plugin in `claude plugin test` until the test puts it
there, so a `world(on)` helper answers every engine call the mod makes and
records what it asked for. Op-style calls are answered as `{ value }`:

```ts
function world(on: On) {
  const seen = { tools: [] as string[], prompts: [] as string[], status: [] as (string | undefined)[] };
  const clock = mock.clock(on, { now: 0 });
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  on("command.register", (_$, e) => ({ value: { command: e.name } }));
  on("tool.register", (_$, e) => {
    seen.tools.push(e.name);
    return { value: { tool: `mcp__komodo__${e.name}` } };
  });
  on("prompt.submit", (_$, e) => {
    seen.prompts.push(e.text);
    return { text: e.text };
  });
  on("ui.status", (_$, e) => {
    seen.status.push(e.text);
    return { value: undefined };
  });
  return { seen, clock };
}
```

`process.run` is answered the same way, `{ value: { exitCode, stdout, stderr,
isStdoutTruncated, isStderrTruncated } }`, with the JSON each CLI mode prints.
Commands are raised fully typed — `{ command, args, origin: { kind:
"composer" }, presentation: { isFullscreen: true, columns: 160 } }` — and
`session.start` with `{ cwd, surface: "terminal", isInteractive: true }`.

Cover: claim → tool offered, status line `Komodo · acme/api#7 · 2h 0m left`,
prompt queued after `clock.advance(0)`; resuming a claim file; empty queue; the
CLI's refusal passed through with the claim path; `submit_review` piping its
input to `submit -` and clearing the job; a refused result returned as
`{ deny }` with the job kept; `submit_review` with no claim; `/komodo-job
forget`.

- [ ] **Step 2: Run them**

Run: `pnpm test:plugin`
Expected: validate clean, 8 tests pass.

- [ ] **Step 3: Commit**

```bash
git add plugin/hooks/register.test.ts package.json
git commit -m "test(plugin): cover claim, refusal and submit in the mod"
```

---

### Task 8: Skill, version, verification

**Files:**
- Modify: `plugin/skills/komodo-review/SKILL.md`
- Modify: the eight version fields `scripts/check-release.mjs` lists → `0.7.0`

- [ ] **Step 1: Teach the skill the fast path**

At the top of *Queue job mode*, add:

```markdown
### In Claude Code with mods: `/komodo-claim`

If this session has the `/komodo-claim` command (Claude Code 2.1.287 or later
with the komodo plugin installed), ask the person to run it instead of steps
1–3. It claims one job, checks out the exact head, hands you the review prompt,
and gives you a `submit_review` tool whose input is the ReviewResult — call it
once when the review is done. `/komodo-claim <claim.json>` resumes a claim after
a restart. `/komodo-job` shows what is claimed.

Everything below still works, and is the path everywhere else.
```

- [ ] **Step 2: Bump the release version to 0.7.0**

Edit all eight fields `scripts/check-release.mjs` names, and add a check there
that `plugin.json`'s `userConfig.cli.default` ends in `komodo-review@<release>`.
Run: `pnpm check:release`
Expected: passes; changing the pin to another version makes it fail naming both.

- [ ] **Step 3: Full verification bar (AGENTS.md rule 10)**

Run: `pnpm typecheck && pnpm lint && pnpm build && pnpm -r test && pnpm test:plugin`
Expected: all clean.

- [ ] **Step 4: Live run against a real store**

1. In a clone of `Delavalom/komodo-playground`, queue a job in
   `.komodo/komodo.db` through the port (`upsertRepository`,
   `upsertPullRequest`, `requestAIReview` for PR #1's head) — what the poller does.
2. CLI half: `claim --checkout --json`, `submit <claim> - --json` with an
   invalid then a valid result; the job reads `completed`.
3. Mod half: `claude --plugin-dir ~/delavalom-labs/komodo/plugin --settings <file>`
   where the file sets `pluginConfigs.komodo.options.cli` to
   `node ~/delavalom-labs/komodo/packages/cli/dist/index.js`.
3. `/komodo-claim` → status line shows `Komodo · Delavalom/komodo-playground#1 · 1h 59m left`; the review turn starts.
4. The model calls `submit_review`; the review appears in the queue at `komodo-review dev`'s URL.
5. Repeat with a deliberately empty `summary` to see the refusal returned and the job kept.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(plugin): document /komodo-claim and release 0.7.0"
```

---

# Phases 2–5 — scoped, each gets its own plan

## Phase 2 — "What the agent ran at `<sha>`"

**Why:** the skill tells the model not to claim it ran something it did not.
Today nothing checks. The mod sees every Bash call.

**Shape:**
- Mod: while a job is active, a `tool.call` hook on `Bash` records
  `{ command, isError, at }` (after `next(e)`), capped at 200 entries, in
  `$.state` (`komodo.ran`). `submit_review` passes it to the CLI as
  `--ran -`-style JSON alongside the result (one stdin object
  `{ result, ran }`).
- Core: `ReviewRecordSchema` gains optional `agentRuns: { command, failed, at }[]`.
- Store (rule 1): `ReviewInput.agentRuns`; a `review_agent_runs` table in
  SQLite and Postgres; `loadReview` returns them; conformance asserts they
  round-trip, keep order, and are absent for reviews that had none.
- Web (rule 3): the review page shows a collapsed "What the agent ran at
  `<sha12>`" list under the result checks, with copy that says it is the
  agent's own record and verifies nothing. It never feeds
  `verificationSummaries` and never satisfies a required check.

**Out of scope:** parsing test output, inferring pass/fail beyond `isError`.

## Phase 3 — Komodo context in the authoring session

**Why:** rule 15 puts source-visible defects in the authoring loop. Komodo
already resolves review guidance (`komodo.yaml` rules, `context.sources`) — the
session writing the code should read it too.

**Shape:**
- CLI: `komodo-review context --emit --paths <changed>` prints the selected
  shared-context documents and repo rules as text (reusing
  `selectSharedContext`; same rule 13 path checks as `memory.ts`).
- Mod: `userConfig.authoringContext` (`off` | `on`, default `off`). When on, a
  `prompt.compose` hook appends one `session`-scoped section
  `komodo:context`, computed once per session and refreshed when `git diff
  --name-only` changes the set of matching globs.
- Optional preflight band (`userConfig.preflight`, default `off`): on
  `turn.complete` after a turn that edited files, `$.model.fork` asks the
  architecture/scope/tests question with that context; the answer shows in
  an `AbovePrompt` band with a Dismiss button. Uses the person's usage, so it
  is opt-in and says so in its description.

## Phase 4 — Watch toasts

**Shape:** with a saved deployment login, a `$.clock.every(5 min)` poll of a
new `GET /api/v1/watches?since=` (or the existing queue route) shows
`$.ui.toast("New comment on acme/api#7")`. Needs an API route (thin over the
port) and nothing else.

## Phase 5 — Read-only queue pane

Only if Phases 1–3 show people living in the terminal. A `/komodo` pane listing
the queue from `GET /api/v1/queue`, each row opening the web review URL.
**No answer or approve controls** — answering stays in the web app, and approve
stays on its one button (rule 15).
