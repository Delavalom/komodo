---
name: komodo-review
description: >
  Run a Komodo review from the current approved Claude session, either for the
  current branch or for one job claimed from a Komodo queue — local, or the
  team's deployment. Source, diffs and prompts stay on the local machine.
---

# Komodo review

You prepare the review brief. Komodo supplies the prompt, validates what you
write, and gives the result somewhere to live. A person still verifies the
changed behavior and makes the GitHub review decision.

Nothing here starts another model process. This Claude session is the
reviewer. A claimed teammate PR needs the user's existing `gh` authentication
only to check out the branch; never attempt a login on the user's behalf.

## Queue job mode

Use this mode when the user asks to work through a Komodo queue — their own
`komodo dev` on this machine, or the team's deployment.

### 0. Point at the deployment, once

Skip this if the queue is the local `.komodo/komodo.db` — that is the default
and needs no setup. For a `komodo serve` on localhost, in a container, or
behind a proxy:

```bash
npx komodo-review login --host <url> --api-key <key>
```

The key is minted in that queue under **Settings → API Keys**. It is saved to
`~/.komodo/host.json`, so nothing after this needs the flag. If the user has
not got a key, say so and stop — never guess a URL, and never put a key on a
command line the user did not type.

Every command that carries the key refuses to send it over plain `http://` to
anything but this machine — including `submit`, which reads its address out of
a claim file rather than from anything you typed. That refusal is correct; do
not work around it. Ask the user for the `https://` address or an SSH tunnel.

### 1. Claim one job

```bash
npx komodo-review claim
```

The command prints a claim JSON path and the exact `owner/repo#number`. If no
job is queued, tell the user and stop. Do not claim several jobs at once.

The claim holds a two-hour lease and names the deployment it came from, so
`submit` goes back to the same place with no further arguments.

### 2. Check out the claimed head

Use the printed PR reference with the user's existing GitHub CLI session:

```bash
gh pr checkout <number> --repo <owner/repo> --detach
```

Confirm `git rev-parse HEAD` matches `headSha` in the claim JSON. The submit
command refuses a different head.

### 3. Review and submit

Run `npx komodo-review prompt`, follow the prompt exactly, and write the single
ReviewResult JSON object it requests to a temporary file. Include concrete
result checks a person can perform. Do not claim to have run, seen, or verified
behavior unless you actually did, and never turn an empty finding list into a
merge recommendation. Then:

```bash
npx komodo-review submit <claim-json> <result-json>
```

This validates the result, writes the judgment and review into the Komodo store
the claim came from — local file or deployment, whichever it named — and
completes the claimed job. It prints a URL for a remote submission; give that to
the user.

If validation fails, correct the JSON and submit again. Do not summarize an
unsubmitted result as completed.

Two refusals are worth recognising rather than retrying blindly:

- *"Claimed `<sha>`, but this checkout is `<sha>`"* — you are on the wrong
  commit. Check out the claimed head; do not edit the claim file.
- *"no longer leased to that worker"* — the two-hour lease expired or someone
  else took the job. Claim again and review the head you are given, which may
  have moved.

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
already open in front of you. Use it. `Read`, `Glob` and `Grep` the surrounding
code to assess architecture, scope, and test adequacy: trace callers, identify
ownership boundaries, and check whether the change reaches unrelated modules.
Treat source-visible bugs as preflight concerns, not as proof of runtime behavior.

A judgement you cannot substantiate this way is one you should drop. If a
claim depends on a rendered screen, real data, an external system, timing, or
layout, turn it into a verification check instead of asserting that it works.
The prompt's own rules govern everything else.

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

Then tell the user the URL it prints. The default view is the result checklist:
the person runs the changed behavior and records evidence. Decisions organize
the architectural, scope, and test questions. A terminal summary is not the
deliverable, and neither completing the checklist nor answering the decisions
grants GitHub approval — that is a separate button, pressed by a person with
their own GitHub account connected.

If the user works from a team deployment rather than a local queue, send the
saved record there instead — the pull request has to already be in that
deployment's inventory, at the head you reviewed:

```bash
npx komodo-review push .komodo/reviews/<id>.json --pr <owner/repo#123>
```

It prints the URL of the stored review. A record built from a local branch
carries no pull request number, which is why `--pr` is needed.

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
