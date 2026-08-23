---
name: komodo-review
description: >
  Run a Komodo code review on the current branch. The running Claude instance
  is the reviewer — no API key, no LLM subscription, no GitHub auth needed.
  Produces judgements you answer in a local queue. Use when the user asks to
  "review my changes", "review this branch", "run komodo", or wants a code
  review before pushing.
---

# Komodo review

You are the reviewer. Komodo supplies the prompt, validates what you write,
and gives the result somewhere to live.

Nothing here needs credentials. `gh` and a Claude or Codex subscription are
only needed to review someone *else's* PR or to post back to GitHub — see
"Reviewing a pull request" at the end.

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

Write the JSON to a temp file, then:

```bash
npx komodo-review validate /tmp/komodo-review.json
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

## Reviewing a pull request

To review a PR rather than the current branch, Komodo runs the review itself
on the user's own Claude or Codex subscription:

```bash
npx komodo-review pr <ref>              # posts a receipt to GitHub
npx komodo-review pr <ref> --local-only # queue only
```

This needs `gh auth login` (or `GITHUB_TOKEN`) and a Claude or Codex login. If
either is missing, say which one and what command fixes it — never attempt a
login on the user's behalf.
