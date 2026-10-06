# Komodo product roadmap

Date: 2026-08-25

## The product in one sentence

Komodo is a self-hosted review queue for teams that want AI assistance on
private code without handing their source to another review vendor or buying
another model subscription.

That is a useful position, but it is not yet a complete product category. The
next work should make the queue trustworthy for a team with a large repository
inventory, then make its decisions useful after the pull request is merged.

## What the market says

This is based on the public product pages for CodeRabbit, Qodo, and Greptile,
checked on 2026-08-25. Their claims are not evidence that Komodo should copy
their products; they show what a buyer will expect to hear.

- CodeRabbit sells review plus triage. Its current story includes risk and
  effort ranking, reviewer routing, a queue view, security scans, agent loops,
  and Slack workflows.
- Qodo sells a governance layer. It emphasizes cross-repository context,
  persistent rules, finding history, auditability, and visibility into issue
  resolution across teams.
- Greptile sells repository understanding and a central validation layer. Its
  public materials emphasize a code graph, parallel review agents, learning
  from comments, integrations with coding agents, and a sandboxed test agent.

The common pattern is not simply "better comments." It is a system that helps a
team decide what deserves attention, explains why, remembers what happened,
and fits the tools already used to change code.

Komodo has a credible counter-position: it already has a local queue, local
and interactive execution paths, GitHub polling, repository context, and a
design that can reuse a team's approved Claude or Codex access. For a Pinterest
scale deployment or a client's infrastructure, data boundary and operational
control are a better opening conversation than feature parity with a hosted
review bot.

## Roadmap

### 1. Finish the inventory-first queue

Priority: P0. This is the foundation and is already described in
`docs/architecture/inventory-first-review-queue.md`.

The queue must show every open pull request before AI work starts. It needs a
durable job and attempt model with explicit states for not requested, queued,
running, retrying, failed, skipped, and completed. Human review state and AI
review state should remain separate. A first repository sync must not create an
unexpected AI bill or launch a backlog of reviews.

Success means an operator can answer these questions from one screen:

- Which pull requests exist right now?
- Which ones need a human decision from me?
- Which ones has Komodo reviewed at the current head?
- What is running, what failed, and when will it retry?

### 2. Make operations observable and reversible

Priority: P0. The first enterprise sale will be lost if an operator cannot
explain a quiet queue or stop an expensive run.

Add per-repository poll health, last successful sync, last error, worker leases,
retry policy, a pause switch, and a visible run history. Add a dry-run mode for
settings changes and a bulk action that shows pull request count, file count,
and changed-line count before starting work. Expose structured logs and a small
health endpoint that can be used by a container orchestrator.

Do not invent token estimates for subscription-backed agents. Measure what
Komodo can know: jobs requested, started, completed, failed, skipped, duration,
and provider errors.

### 3. Turn review history into governance evidence

Priority: P1. Qodo makes persistent rules and audit history part of the buying
story. Komodo already stores decisions and repository context; it should make
that history legible without becoming a compliance product overnight.

Add an exportable audit view for review runs, findings, human decisions,
settings changes, actor, repository, pull request, head SHA, and timestamps.
Add finding lifecycle states based on evidence from the store, not a manually
maintained counter. Add a small rules report: which repository rules produced
findings, how often findings were dismissed, and how often they were fixed
before merge.

The first version should export JSON and CSV and retain the existing local
deployment model. SSO, retention policies, and formal compliance attestations
belong in discovery until there is a customer asking for them.

### 4. Build a context advantage that is safe to explain

Priority: P1. Greptile and Qodo both lead with repository-wide context. Komodo
should earn this claim incrementally.

Start with deterministic context: changed files, imports and dependents where
available, relevant repository rules, linked tickets, and prior findings on the
same code path. Show the context sources used in each review. Reject paths that
escape the checked-out repository, and keep provider payload boundaries visible
to operators.

Later, add a cross-repository relationship map for teams that own services and
libraries together. The output should be an impact explanation, not a graph
visualization for its own sake.

### 5. Meet engineers where they fix the problem

Priority: P1. Review comments are only valuable when they lead to a verified
change.

Keep the existing Claude Code skill and add first-class links from a finding to
its local checkout, a focused fix prompt, and a re-review action. Add a small
CLI flow that claims a job, prints its context, submits a result, and reports
whether the finding changed after the next head. Consider Slack notifications
only after the queue and job model are dependable; notification volume is not a
product win by itself.

### 6. Add autonomous testing as an opt-in experiment

Priority: P2. Greptile is already positioning an agent that writes and runs
tests. This is attractive, but it increases execution risk and operational
cost.

Prototype a sandboxed, opt-in test pass for selected repositories. It must have
an explicit time and resource limit, produce artifacts that a human can inspect,
and never silently change the working tree or post a merge decision. Treat test
results as evidence attached to a review, not as an automatic approval.

## GTM plan

### Initial customer

Target platform and infrastructure teams that have private repositories,
existing Claude or Codex access, and a requirement to keep source inside their
network boundary. Pinterest is a useful scale reference; the client
deployment is the more important design partner because it can expose the
operational questions before broad launch.

The wedge is not "our model is smarter." It is:

> Give an infrastructure team a review queue it can run, inspect, pause, and
> audit on its own machines, using access it already approved.

### Proof to collect

For each deployment, capture a baseline before claiming improvement:

- open pull requests at each sync;
- time from pull request creation to first useful review;
- percentage of reviews completed, failed, retried, or skipped;
- findings marked useful, dismissed, fixed, or still open;
- human review delay for pull requests with and without a Komodo review;
- provider and infrastructure cost that the customer can actually observe.

Do not publish aggregate customer numbers until the same definitions have been
used across deployments and the customer has approved the disclosure.

### Packaging

Keep the local developer path free and simple. For teams, sell operational
capability rather than seats: supported deployment, repository fleet controls,
audit export, integration support, and a response path for incidents. This
matches the product's strongest difference and avoids competing head-on with
hosted per-seat review pricing before Komodo has comparable distribution.

## Explicit non-goals

For the next two releases, do not build a generic chat surface, a marketplace
of review personas, a dashboard full of ungrounded quality scores, or an
automatic approval policy that hides uncertainty. Those features make a demo
look busy while the core questions of inventory, job state, evidence, and data
boundary remain unanswered.

## Sources

- CodeRabbit product overview: https://www.coderabbit.ai/
- Qodo product overview: https://qodo.ai/
- Greptile product overview: https://www.greptile.com/
- Komodo inventory-first queue design: `docs/architecture/inventory-first-review-queue.md`
