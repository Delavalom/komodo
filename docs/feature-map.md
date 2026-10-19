# Komodo feature map

What a person can do in the web app, where, and what they should see. The
reviewer reads this file when it reviews a pull request to Komodo, and writes
its verification steps from it. `node scripts/check-feature-map.mjs` fails when
a route exists that is not listed here.

**To run it:** `komodo dev` with no GitHub token serves a seeded SQLite
store. From a checkout, `pnpm dev` seeds an empty store too
(`apps/web/.env.development` sets `KOMODO_SEED`), at http://localhost:3000.
Add `KOMODO_DB=/tmp/komodo.db` to leave the default database untouched. `[org]` is the organization slug
the root URL redirects to. View state lives in the query string (AGENTS.md
rule 8), so every link below can be shared and reloaded.

## Entry points

- `/` → redirects to `/[org]/-/queue`.
- `/[org]` and `/[org]/-` → redirect to the queue.
- `/-/pr/[owner]/[repo]/[number]` → the link a GitHub receipt carries. It
  redirects to the pull request's review under this deployment's org and keeps
  `?run=`.

## Queue — `/[org]/-/queue`

The pull requests waiting on a person. Header nav: **Queue**.
- `?lens=mine|all|blocked|stale|easy` picks the list (default `mine`).
- `?open=<row id>` expands a row.
- Seeded store: open PRs with AI state, check rollups and verification counts.
  A row whose checks were read from an older head shows no checks rather than a
  green pill.

## Pull requests — `/[org]/-/pull-requests`

Every tracked pull request, reviewed or not. Header nav: **Pull Requests**.
- Facets in the query: `author`, `repo`, `subgroup`, `status`
  (completed|pending|skipped|error|…), `confidence`, `impact`; `sort=asc`.
- **Request review** queues an AI review job for that head.

## Review — `/[org]/-/pull-requests/[owner]/[repo]/[number]`

One pull request's review: the screen the product exists for.
- Default tab: **result verification**. Each check shows its instruction and
  expected result. **Record result** appends evidence (result, kind, URL,
  note). Earlier entries stay on record; the newest one counts.
- `?view=decisions`: the decision queue, one judgement at a time. `?j=<n>`
  names the judgement on screen; `j` one past the last is the closing screen.
  Keys 1–4 answer, ←/→ move, `u` withdraws. After agreeing or blocking,
  **Remember this for future reviews** opens Add Context prefilled from the
  judgement. Saving it creates a custom rule the reviewer applies next time.
- `?view=whole`: summary, walkthrough, diagram and answers grouped by bucket.
- `?view=conversation`: the GitHub conversation, with replies.
- `?run=<headSha>`: an earlier run. Runs are immutable.
- Closing screen: the verification tally and the GitHub review button. It
  submits with a personal token from Personal → Connections, never the
  deployment's.

## Watchers — `/[org]/-/pull-requests/watchers`

Pull requests someone asked to follow, and the events seen on them.

## Analytics — `/[org]/-/analytics`

Derived at read time from reviews, answers and votes. Header nav: **Analytics**.
- `?tab=findings` switches from the reviews tab to the findings tab.

## Memory — `/[org]/-/custom-context`

Header nav: **Memory**. The index redirects to Custom rules.
- `/[org]/-/custom-context/context` — **Custom rules**. **Add Context** creates
  a rule (text) or a file rule (a path the reviewer reads from the checkout).
  `?memory=<id>` opens a rule's drawer. Facets: `repository`, `type`,
  `status`, `usage`, `acceptance`.
- `/[org]/-/custom-context/repo-clusters` — **Cross-repo context**: clusters
  and the shared context sources from `komodo.yaml`, as last resolved.
- `/[org]/-/custom-context/knowledge-base` — **Knowledge Base**: the files
  rules actually resolved to.
- `/[org]/-/custom-context/integrations` — **Integrations**: issue trackers.

## Settings — `/[org]/-/settings`

The index redirects to Add/Remove Repos. Every control here reaches the
reviewer or the poller (AGENTS.md rule 3).
- `/[org]/-/settings/manage-repos` — **Add/Remove Repos**.
- `/[org]/-/settings/repo` — repository **Settings**.
- `/[org]/-/settings/code-providers` — **Code Providers**: deployment status.
- `/[org]/-/settings/review` — **Code Review**: when Komodo reviews, review
  depth, PR summaries, custom instructions, comments, status checks.
- `/[org]/-/settings/memory` — **Memory**: whether custom context reaches
  the reviewer at all.
- `/[org]/-/settings/organization` — **Organization**.
- `/[org]/-/settings/people` — **People**: the roster and invites.
- `/[org]/-/settings/api-keys` — API keys. The plaintext is shown once, at
  creation.
- `/[org]/-/settings/billing`, `/[org]/-/settings/usage`.
- `/[org]/-/settings/audit-log` — marked Beta.

## Personal settings — `/user/settings`

The index redirects to Account.
- `/user/settings/account` — profile, roles and access. Who this device
  answers as is picked from the header's account menu (a cookie, not a
  credential: AGENTS.md rule 11).
- `/user/settings/integrations` — **Connections**: the personal GitHub token
  the review button submits with.
- `/user/settings/review` — personal review preferences, such as showing AI
  fix prompts.
