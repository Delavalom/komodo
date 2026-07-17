---
name: komodo-review
description: >
  Run a Komodo AI code review on a GitHub pull request using the user's own
  Claude or ChatGPT subscription, and post the review (walkthrough, severity-
  tagged inline comments, committable suggestions) to the PR. Use when the user
  asks to "review this PR", "run komodo", or wants a CodeRabbit-style review of
  a pull request.
---

# Komodo review

Review a GitHub pull request with [Komodo](https://github.com/Delavalom/komodo).

## Steps

1. Determine the PR to review from the user's request: a PR URL, `owner/repo#123`,
   or a bare number when the current directory is a clone of the repo. If ambiguous,
   run `gh pr list` in the current repo and confirm with the user.
2. If the repo has no `komodo.yaml`, run `npx komodo-review init` first (non-destructive;
   it only detects existing logins and writes a config template).
3. Run the review:
   ```bash
   npx komodo-review pr <ref>
   ```
   - Add `--local-only` if the user wants to preview without posting to GitHub.
   - Add `--provider claude` or `--provider codex` if the user names one.
4. Report the outcome: confidence score, findings with severities, the posted
   review URL, and mention `npx komodo-review ui` for the local viewer.

## Notes

- Komodo uses the credentials the user already created (`claude`, `codex login`,
  `gh auth login`). If a provider is missing, tell the user which official login
  command to run themselves — never handle credentials directly.
- Reviews of large PRs can take several minutes; run the command with a generous
  timeout or in the background.
