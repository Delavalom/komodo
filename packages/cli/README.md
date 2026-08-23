# komodo-review

**AI code review on your own subscription.** Komodo reads a pull request the
way a reviewer does — the diff, the code around it, and what your team has
written down — and turns it into a queue of judgements someone can actually
answer. Powered by the Claude or ChatGPT subscription you already pay for.
$0/seat.

```bash
npx komodo-review init   # detect your Claude/Codex login + GitHub auth
npx komodo-review pr 43  # review the PR, post to GitHub, view locally
```

## Commands

| Command | Does |
|---|---|
| `init` | Detect credentials and write a `komodo.yaml` |
| `pr <number>` | Review a pull request, post the result to GitHub |
| `diff` | Review the working tree against a base branch |
| `prompt` | Print the review prompt and exit — for an agent that reviews it itself |
| `dev` | The local queue: poller, reviewer and UI against a SQLite store |
| `serve` | The same three as a long-lived team deployment |
| `config` / `validate` | Show the resolved configuration, or check the file |

## Credentials

- **Claude subscription** → the [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview),
  reusing the Claude Code login you created yourself with `claude`.
- **ChatGPT subscription** → headless [Codex CLI](https://github.com/openai/codex)
  (`codex exec`), reusing your `codex login`.
- **GitHub** → your `gh` CLI token or a fine-grained PAT. No GitHub App required.

Komodo never performs, brokers, or stores logins for any provider — it detects
credentials **you** created with the official tools and uses them on your
machine. API keys (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY`) work too.

## Node versions

Node 22 or newer for `init`, `pr`, `diff`, `prompt`, `config` and `validate`.

`dev` and `serve` open a SQLite store through `node:sqlite`, which needs
**Node 24 or newer** — or a `postgres://` `DATABASE_URL`, which loads the
Postgres driver instead and runs anywhere. On an older Node the SQLite path
fails with a message saying exactly this rather than an unknown-module error.

## In Claude Code

The same review runs as a plugin, with the Claude instance you are already
talking to as the reviewer — no API key and no second subscription:

```
/plugin marketplace add Delavalom/komodo
/plugin install komodo@komodo
/komodo:review
```

## Deploying for a team

`komodo serve` polls GitHub rather than receiving webhooks, so a deployment
needs no GitHub App, no inbound path and no secret to rotate. See
[Deploying for a team](https://github.com/Delavalom/komodo#deploying-for-a-team)
in the repository README — including the note that the queue has no
authentication of its own and belongs behind your VPN or an authenticating
proxy.

## License

MIT
