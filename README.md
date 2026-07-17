# Komodo

**AI code review on your own subscription.** Komodo reviews your pull requests with the depth of CodeRabbit or Greptile — powered by the Claude or ChatGPT subscription you already pay for. $0/seat.

```bash
npx komodo-review init   # 1. detect your Claude/Codex login + GitHub auth
npx komodo-review pr 42  # 2. review the PR, post to GitHub, view locally
```

## How it works

- **Claude subscription** → runs on the [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview), reusing the Claude Code login you created yourself with `claude`.
- **ChatGPT subscription** → runs headless [Codex CLI](https://github.com/openai/codex) (`codex exec`), reusing your `codex login`.
- **GitHub** → your `gh` CLI token or a fine-grained PAT. No GitHub App required.

Komodo never performs, brokers, or stores logins for any provider — it only detects credentials **you** created with the official tools, and uses them on your machine. If you'd rather use API keys (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY`), that works too.

## What you get on every PR

- **Summary + walkthrough table** — related files grouped into single rows, plain-language change descriptions
- **Merge-confidence score (0–5)** and review-effort estimate
- **Inline comments** with severity (🔴 Critical → 🔵 Trivial) × category (security, correctness, performance…), committable ` ```suggestion ` fixes, and copy-paste "fix prompts" for your coding agent
- **Mermaid sequence diagrams** for flow-changing PRs
- **Local review UI** (`komodo-review ui`) that ranks what matters and collapses the noise

## Status

`komodo-review` is [live on npm](https://www.npmjs.com/package/komodo-review). Cloud version (pick any model, pay per credit) is in beta.

## License

MIT
