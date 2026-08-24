---
name: komodo-review
description: >
  Run a Komodo review from the current approved Claude session, either for the
  current branch or for one job claimed from a local Komodo queue. Source,
  diffs, prompts, and results stay on the local machine.
---

# Komodo review

You are the reviewer. Komodo supplies the prompt, validates what you write,
and gives the result somewhere to live.

Nothing here starts another model process. This Claude session is the
reviewer. A claimed teammate PR needs the user's existing `gh` authentication
only to check out the branch; never attempt a login on the user's behalf.

## Queue job mode

Use this mode when the user asks to work through the local Komodo queue.

### 1. Claim one job

```bash
npx komodo-review claim
```

The command prints a claim JSON path and the exact `owner/repo#number`. If no
job is queued, tell the user and stop. Do not claim several jobs at once.

### 2. Check out the claimed head

Use the printed PR reference with the user's existing GitHub CLI session:

```bash
gh pr checkout <number> --repo <owner/repo> --detach
```

Confirm `git rev-parse HEAD` matches `headSha` in the claim JSON. The submit
command refuses a different head.

### 3. Review and submit

Run `npx komodo-review prompt`, follow the prompt exactly, and write the single
ReviewResult JSON object it requests to a temporary file. Then:

```bash
npx komodo-review submit <claim-json> <result-json>
```

This validates the result, writes the judgment and review into the same local
Komodo store, and completes the claimed job. If validation fails, correct the
JSON and submit again. Do not summarize an unsubmitted result as completed.

## Current branch mode

## 1. Get the prompt

```bash
npx komodo-review prompt
```

Pass `--base <branch>` if the user names one. The output is the complete
review instruction — persona, the annotated diff, this repository's
`komodo.yaml` rules, and the exact JSON schema to produce.

Do not restate or summarise it. **Follow it.** It is the same prompt Komodo
sends to Claude and Codex when it runs headless, which is what keeps your
review and theirs the same product.

If it exits saying there are no reviewable changes, tell the user that and
stop. If the output is enormous (a long-lived branch), suggest a narrower
`--base` rather than reviewing a thousand files badly.

## 2. Review

You have something the headless providers usually do not: the working tree is
already open in front of you. Use it. `Read`, `Glob` and `Grep` the
surrounding code for any file where the diff alone is ambiguous — trace the
callers, check how a changed function is used elsewhere, confirm the type is
what you assumed — before you claim a bug.

A judgement you cannot substantiate this way is one you should drop. The
prompt's own rules govern everything else.

## 3. Save it

Write the requested ReviewResult JSON to a temp file. Wrap it with the local
diff metadata before validation:

```bash
npx komodo-review diff > /tmp/komodo-context.json
# Set the context object's `result` field to the ReviewResult JSON.
npx komodo-review validate /tmp/komodo-context.json
```

It validates against the schema and prints where it saved the record. If it
reports errors, fix the JSON and run it again — do not hand the user a review
that failed validation.

## 4. Open the queue

```bash
npx komodo-review dev
```

Then tell the user the URL it prints. This is the point of the exercise: each
judgement is a question with four answers, and answering them is how the
review closes. A summary in the terminal is not the deliverable.

If a queue is already running on that port, say so instead of starting
another.

## Direct headless pull-request mode

Use this only when the approved environment permits Komodo to start its own
provider process. On managed Pinterest machines, prefer Queue job mode so this
already-approved Claude session performs the review.

```bash
npx komodo-review pr <ref>              # posts a receipt to GitHub
npx komodo-review pr <ref> --local-only # queue only
```

This needs `gh auth login` (or `GITHUB_TOKEN`) and a Claude or Codex login. If
either is missing, say which one and what command fixes it — never attempt a
login on the user's behalf.
