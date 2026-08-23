# Komodo

**AI code review on your own subscription.** Komodo reads a pull request the way a reviewer does — the diff, the code around it, and what your team has written down — and turns it into a queue of judgements someone can actually answer. Powered by the Claude or ChatGPT subscription you already pay for. $0/seat.

```bash
npx komodo-review init   # 1. detect your Claude/Codex login + GitHub auth
npx komodo-review pr 43  # 2. review the PR, post to GitHub, view locally
```

Or inside Claude Code, with the instance you are already talking to as the
reviewer — no API key and no second subscription:

```
/plugin marketplace add Delavalom/komodo
/plugin install komodo@komodo
/komodo:review
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
- **Local review queue** (`komodo-review dev`) that ranks what matters and collapses the noise

## Deploying for a team

`komodo serve` runs the poller, the reviewer and the queue as one long-lived
service. It polls rather than receiving webhooks, so it needs no GitHub App,
no inbound path and no secret to rotate — only egress to GitHub and to the
model provider.

```bash
docker run -p 4400:4400 --env-file komodo.env \
  -v $PWD/komodo.yaml:/app/komodo.yaml \
  -v komodo-state:/app/.komodo \
  ghcr.io/delavalom/komodo:latest
```

Every tagged release publishes that image; `docker build -t komodo .` from a
clone builds the same thing.

A deployment needs a `team:` block in komodo.yaml — the logins whose queue this
is, and the first repositories to watch. Everything else under those owners is
discovered on a later pass and listed under **Settings → Manage Repositories**,
switched off until someone enables it; **Repo Settings → Auto-enable new repos**
flips that default. Enabled is the only thing the poller reads, so that toggle
is the switch.

`komodo.env` carries `DATABASE_URL` (a `postgres://` URL selects the Postgres
driver; anything else is a SQLite path), `GITHUB_TOKEN`, and one provider
credential. Point `local.url` in komodo.yaml at the deployment's real hostname
so review receipts link back to it.

The reviewer fetches a shallow working tree per repository so it reads the
code around a change rather than the patch alone — the same context
`komodo-review pr` gets from your checkout. Trees live under `.komodo/repos`
(`--repo-cache` to move them, `--no-checkout` to review diffs only).

`GET /api/health` reports whether the store is reachable and when the poller
last finished a pass — the container declares it as its healthcheck.

**Note:** the queue has no authentication of its own. Run it behind your
VPN or an authenticating proxy; anyone who can reach the port can read every
review and act on it. The HTTP API below is the exception, and is the only
surface that checks a credential.

The account menu carries an **Acting as** picker naming whoever on the roster
is at that browser. It is not a sign-in and grants nothing — it decides whose
name the decision ledger records, so a team sharing one deployment gets four
names in its history instead of one.

## Configuring it

`komodo.yaml` is what a fresh deployment starts from. On first boot its review
settings are adopted into the database, and the **Settings → Review** screen
owns them after that — so a threshold can be changed without shell access to
the server, and the change takes effect on the next poll rather than the next
restart. Which repositories are watched, who the team is, which provider to
use and where the deployment lives stay in the file: those are facts about the
deployment, not preferences.

What the screen controls, and what each control actually does:

| Setting | Effect |
|---|---|
| Auto-enable new repos | A newly discovered repository is polled at once, or waits to be enabled |
| Auto-review on new commits | A new head re-enters the work list, or the first verdict stands |
| Review draft pull requests | Drafts are reviewed rather than skipped |
| File change limit | Larger pull requests are skipped and recorded as skipped |
| Author filter | Bots (or everyone but one person) are skipped |
| Strictness | The severity floor: only critical, down to everything minor |
| Custom instructions | Handed to the model with every diff |
| Summary sections | Which blocks a posted review carries |
| Status checks | The commit status, and the confidence it passes at |
| Auto-approve | Approves when nothing worse than a chosen severity was found |

A pull request that is skipped gets a row in the queue saying why, rather than
vanishing — and with `post.status_comments` on, a comment on GitHub saying the
same.

## Custom context

**Custom context → Context** is what this team has taught Komodo. A rule is
either a sentence you write or a pointer at files already in the repository —
`CLAUDE.md`, `AGENTS.md`, `.cursorrules` — whose contents the reviewer reads
off the working tree it already has. Rules are scoped by repository (or a
cluster of them) and by file glob, so a rule about migrations is not handed to
a reviewer reading a CSS change.

Connect Linear or Jira under **Integrations** and a pull request whose title
names an issue gets that issue's text alongside the diff — which is usually
where the answer to "is this the right change" actually lives.

## HTTP API

Create a key under **Settings → API keys**. It is shown once and stored as a
hash; a lost key is replaced rather than recovered.

```bash
curl -H "Authorization: Bearer kmd_…" https://komodo.example.com/api/v1/queue
```

| Endpoint | Does |
|---|---|
| `GET /api/v1/queue` | The team's queue, as data |
| `GET /api/v1/reviews/:id` | One run: judgements, answers, votes |
| `POST /api/v1/reviews/:id/receipt` | Post the decided outcome to GitHub |
| `POST /api/v1/repos/:id/retrigger` | Send a repository's reviews back to the work list |

## Status

`komodo-review` is [live on npm](https://www.npmjs.com/package/komodo-review),
and the Claude Code plugin installs from this repository. Cloud version (pick
any model, pay per credit) is in beta. Releasing both is
[RELEASING.md](RELEASING.md).

## License

MIT
