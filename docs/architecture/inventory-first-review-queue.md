# Inventory-first review queue

Status: Accepted; implementation in progress
Date: 2026-08-24

## Decision

Komodo should synchronize pull request inventory without starting AI work. The
first successful synchronization for each repository imports its open pull
requests as `not_requested`. Later pull requests and later heads may enter the
AI queue according to team settings. A person can request an AI review for any
imported pull request or selected group.

The inventory poller and the AI worker should run independently. The queue
should render one row per raw pull request and show human-review state and AI
state in separate columns. A pull request must not need a `Judgment` to exist
in the product.

AI work should use a durable job and attempt model. `Judgment` should return to
meaning only an AI result. It should not also mean not requested, queued,
running, failed, and ready to retry.

Komodo supports two executors over that same job model:

- A local worker inside `komodo dev`, using an explicitly configured,
  enterprise-approved Claude Code executable. The checkout, diff, prompt, and
  review result remain on the employee's machine and network boundary.
- An interactive Komodo skill inside an already-approved Claude session. The
  skill claims one job, reviews the local checkout, and submits the structured
  result to the local Komodo service.

The local worker is the default UX when the enterprise launcher supports
headless Agent SDK sessions. The interactive skill is a policy-compatible
handoff, not a separate queue or review format. Uploading source or diffs to a
third-party Komodo worker is not part of this design.

## What produced the reported logs

The current opening pass performs these operations in one sequence:

```text
start web server
load settings
discover repositories
poll all enabled repositories
select every open PR without a completed or skipped judgment at its current head
review that entire list one PR at a time
sleep for the configured interval
```

`Polled 168 open PRs - 0 changed, 0 closed` describes only the GitHub inventory
pass. `changed` means that a pull request was new to the store or its head SHA
moved. It does not mean that zero pull requests need AI review. Immediately
after that message, `reviewPending()` asks the store for a different list:
every open current head without a completed or skipped judgment.

The implementation then reviews that list serially. One failed review is
recorded and the next pull request starts immediately. Errors and usage limits
return on the next pass because the store treats only `completed` and
`skipped` as settled.

The remaining messages have separate causes:

- `Reviewing 6/6 files with claude` means path filters retained all six files.
- The short prose lines are Claude progress text. Komodo prints the first 120
  characters of the provider's assistant message.
- The SQLite experimental warning comes from Node's `node:sqlite` driver. It
  is unrelated to the review failures.
- Exit code 143 conventionally means that the Claude child ended after
  `SIGTERM`. Komodo sets no Claude timeout and does not pass its abort signal
  into the provider. The log does not identify which process or machine policy
  sent the signal. A restricted-machine supervisor is plausible, but not
  proven.
- Web exit code 130 conventionally follows `SIGINT`, which matches Ctrl+C.
- Ctrl+C currently stops the web child but does not stop the active review
  batch. `reviewPending()` does not check the signal between pull requests, so
  it can start another review after the web server exits.
- `Claude returned no JSON review payload` means that the provider stream
  ended before it delivered structured output. In the reported sequence, that
  happened during shutdown.

The startup backlog was intentional in the first ingest implementation,
[commit `72b7fa6`](https://github.com/Delavalom/komodo/commit/72b7fa61234f4f7ff0c49ab890f9a6293e375c64):
poll, review everything outstanding, sleep, and repeat. The history documents
freshness and restart safety as goals. It does not define an initial backfill
policy, a token budget, a batch limit, retry backoff, or a distinct AI waiting
state. The eager backfill is therefore implemented behavior, but its cost
policy was never designed.

## The current product cannot represent the intended queue

Polling writes `pull_requests`. The shared web snapshot exposes `judgments`,
not raw pull requests. Both list views iterate judgments, and the per-PR route
returns 404 when a judgment does not exist. A new pull request becomes visible
only after AI completes, skips, or fails and writes a judgment.

This creates the wrong dependency:

```text
show an open pull request -> create an AI judgment -> run or fail an AI review
```

There are related correctness gaps:

- `pending` is written by manual retrigger, not for all queued work.
- No state records that a provider is actively reviewing a pull request.
- Failure details, attempt counts, and next retry times are not stored.
- The queue renders every null verdict as `Not reviewed`, hiding skipped,
  failed, limited, and pending states.
- Human review facts update only when the head SHA moves. A same-head approval,
  reviewer request, title edit, or draft transition can remain stale.
- Historical judgments join to the current pull request by `prId` alone. A PR
  with several reviewed heads can produce duplicate queue rows.
- The detail route can show the latest completed review from an older head
  while the current head waits or fails.

## Product behavior

### First repository synchronization

The first complete open-PR listing for each repository is inventory-only.

- Import every open pull request.
- Mark the repository baseline complete only after the full listing commits.
- Do not create AI jobs for that baseline.
- If the listing fails, keep the baseline incomplete and try again later.
- If the process crashes during the first listing, the next run remains in
  baseline mode. Repeating the operation must not create jobs.

The baseline belongs to one repository, not the whole deployment. A global
first-run marker fails when one repository is temporarily unreachable or when
a repository is enabled later.

### Steady state

After a repository baseline exists, these events can request AI work:

- A pull request is first observed.
- A known pull request gets a new head and `autoReviewNewCommits` is enabled.
- A draft becomes ready for review and draft review was previously disabled.
- A closed pull request reopens, if the team enables that policy.
- A person selects **Review with AI** or uses the bulk action.

Add `autoReviewNewPullRequests` to `OrgSettings`. New installations should
default it on. Upgrades should establish baselines for already-known
repositories before applying this policy, so an upgrade cannot enqueue the
historical backlog.

Manual backfill remains explicit. The queue should show the PR count, file
count, and changed-line total before confirmation. Komodo cannot promise an
exact token estimate for subscription-backed agents, so the UI should not
invent one.

### Human review and AI review are independent

One row should carry two states.

Human-review state is derived from fresh GitHub facts:

```ts
type HumanReviewState =
  | { kind: "draft" }
  | { kind: "changes_requested"; by: string[] }
  | { kind: "awaiting_review"; reviewers: string[]; mine: boolean }
  | { kind: "approved"; by: string[] }
  | { kind: "unassigned" };
```

AI state is derived from the current-head job, attempt, and result:

```ts
type AIReviewState =
  | { kind: "not_requested" }
  | { kind: "queued"; requestedAt: number }
  | { kind: "running"; startedAt: number }
  | { kind: "retry_wait"; nextAttemptAt: number; failure: ReviewFailure }
  | { kind: "failed"; failure: ReviewFailure }
  | { kind: "skipped"; reason: string }
  | { kind: "completed"; reviewId: string; confidence: number }
  | { kind: "cancelled" };
```

An AI result does not close a GitHub pull request. A human approval does not
make the pull request merged. The row stays until GitHub reports it merged or
closed.

The default **Needs my review** lens is broader than GitHub's explicit review
request list. It means:

```text
open AND not draft AND author is a roster teammate AND author is not me
AND I have not approved or requested changes
```

An explicit GitHub review request remains useful row context, but is not an
eligibility requirement. This makes the lens a personal view over the team's
whole repository inventory, including PRs that use team-level or informal
review assignment.

### Do not claim to know why a PR is open without the facts

Komodo currently knows the requested reviewers, approvals, changes requests,
draft flag, and GitHub open state. It does not know required approval counts,
required checks, merge conflicts, branch protection, or merge-queue state.
Those fields are necessary to answer "why is this still open?"

Until Komodo ingests them, label the panel **Review activity**, not **Why open**.
After a batched GitHub query supplies merge readiness, show **Open signals**:

- Draft
- Waiting for named reviewers
- Changes requested by named reviewers
- Required checks pending or failing
- Merge conflict
- No blocking signal found; an author or maintainer has not merged it

The last line is deliberately factual. Komodo should not invent a reason from
the absence of a merge.

## Caller usage

The CLI starts inventory and AI work as independent services:

```ts
const poller = new InventoryPoller({ store, github, intervalMs });
const worker = new ReviewWorker({
  store,
  reviewer,
  retryPolicy: DEFAULT_RETRY_POLICY,
  leaseMs: 10 * 60_000,
});

await Promise.all([poller.run(signal), worker.run(signal)]);
```

The poller records one complete repository observation. The store owns
baseline detection and automatic enqueue in one transaction:

```ts
const observation = await github.observeOpenPullRequests(repo);

await store.recordRepositoryObservation({
  repoId: repo.id,
  observedAt: clock.now(),
  pullRequests: observation,
  policy: {
    autoReviewNewPullRequests: settings.autoReviewNewPullRequests,
    autoReviewNewCommits: settings.autoReviewNewCommits,
    reviewDraftPrs: settings.reviewDraftPrs,
  },
});
```

The web process requests work through the store:

```ts
await store.requestAIReviews({
  commandId,
  requests: selected.map((pr) => ({
    prId: pr.id,
    headSha: pr.headSha,
    trigger: "manual",
    requestedBy: actor.githubLogin,
  })),
});
```

The worker claims and completes one attempt:

```ts
const claim = await store.claimNextAIReview({
  workerId,
  now: clock.now(),
  leaseMs,
});

if (claim) {
  const result = await reviewer.review(claim.input, { signal });
  await store.finishAIReviewAttempt(claim.token, mapCompletion(result));
}
```

## Domain shape

```ts
type ReviewTrigger =
  | "new_pull_request"
  | "new_commit"
  | "ready_for_review"
  | "reopened"
  | "manual"
  | "interactive";

type ReviewJobState =
  | "queued"
  | "running"
  | "retry_wait"
  | "completed"
  | "skipped"
  | "failed"
  | "cancelled";

interface AIReviewJob {
  id: string;                 // `${prId}@${headSha}`
  prId: string;
  headSha: string;
  trigger: ReviewTrigger;
  state: ReviewJobState;
  requestedBy: string | null;
  requestedAt: number;
  nextAttemptAt: number | null;
  cancelRequestedAt: number | null;
  completedReviewId: string | null;
  lastFailure: ReviewFailure | null;
}

interface AIReviewAttempt {
  id: string;
  jobId: string;
  ordinal: number;
  workerId: string;
  leaseExpiresAt: number;
  startedAt: number;
  finishedAt: number | null;
  outcome:
    | { kind: "running" }
    | { kind: "completed"; reviewId: string }
    | { kind: "skipped"; reason: string }
    | { kind: "failed"; failure: ReviewFailure }
    | { kind: "cancelled"; reason: string };
}

interface ReviewFailure {
  kind:
    | "transient"
    | "provider_unavailable"
    | "usage_limit"
    | "configuration"
    | "invalid_output"
    | "interrupted";
  message: string;            // sanitized for the UI
}

interface RepositorySyncState {
  repoId: string;
  baselineCompletedAt: number | null;
  lastSuccessfulPollAt: number | null;
  lastError: string | null;
}

interface PullRequestOverview {
  pr: PullRequest;
  currentJudgment: Judgment | null;
  currentJob: AIReviewJob | null;
  latestCompletedReview: Review | null;
}
```

`PullRequestOverview` is the queue source and contains exactly one row per pull
request. `currentJudgment` joins on both `prId` and the pull request's current
`headSha`. Historical judgments remain available for analytics and run
history, but cannot create duplicate inventory rows.

The deterministic job ID makes repeated auto-enqueue and manual clicks
idempotent. An attempt is append-only. A lease lets a crashed worker's job
become claimable again without guessing whether it was running.

## Store port sketch

All methods below belong in `packages/store/src/port.ts`. Both drivers must
implement them, and the shared conformance suite must define their behavior.

```ts
interface StoreReader {
  snapshot(): Promise<QueueSnapshot>; // includes PullRequestOverview[]
  loadPullRequestOverview(prId: string): Promise<PullRequestOverview | null>;
  loadDiffSnapshot(prId: string, headSha: string): Promise<DiffSnapshot | null>;
}

interface StoreWriter {
  recordRepositoryObservation(
    input: RepositoryObservation,
  ): Promise<RepositoryObservationResult>;

  requestAIReviews(
    command: RequestAIReviewsCommand,
  ): Promise<AIReviewJob[]>;

  claimNextAIReview(
    input: ClaimAIReviewInput,
  ): Promise<AIReviewClaim | null>;

  renewAIReviewLease(
    token: AIReviewClaimToken,
    now: number,
  ): Promise<boolean>;

  finishAIReviewAttempt(
    token: AIReviewClaimToken,
    completion: AIReviewCompletion,
  ): Promise<void>;

  requestAIReviewCancellation(
    jobId: string,
    requestedAt: number,
  ): Promise<void>;

  saveDiffSnapshot(snapshot: DiffSnapshot): Promise<void>;
}
```

`recordRepositoryObservation()` is a deep operation. It updates Git facts,
closes vanished PRs, establishes the repository baseline, detects new PRs and
new heads, and creates eligible jobs in one transaction. A caller cannot write
a newcomer and crash before recording its review intent.

`finishAIReviewAttempt()` is also transactional. A success writes the
judgment, review, review files, review judgments, findings, attempt outcome,
and final job state together. This replaces the current partial-write window
across several store calls.

## Polling and GitHub freshness

The poller should always update fields already present in the open-PR listing,
even when the head is unchanged. That includes title, draft state, requested
reviewers, and `updatedAt`.

Approval and changes-request state needs a separate freshness policy. The
current REST implementation costs another request per PR. Prefer one batched
GitHub GraphQL repository query that returns open PRs, review decision,
requested reviewers, merge state, and check summary. Keep REST polling as a
fallback if the GraphQL query is unavailable.

The GitHub adapter validates and normalizes the response into domain facts.
Wire payloads must not cross the core boundary.

## Review worker behavior

The worker begins with concurrency one. Concurrency is an explicit setting
later, not an accidental result of multiple loops.

Claiming is atomic. Postgres can use row locking with `SKIP LOCKED`; SQLite can
use an immediate transaction. The public port returns an opaque claim token,
so callers do not learn either driver's locking method.

Retry policy is pure and bounded:

- Transient failures receive a small number of retries with exponential delay.
- Invalid structured output receives one retry.
- Usage limits wait for a known reset or a person.
- Configuration failures stop immediately.
- Service shutdown returns an explicitly requested job to the queue without
  consuming a retry.

The same abort signal must reach GitHub fetches, retry sleeps, checkout,
`ReviewWorker`, `runReview()`, and `ReviewProvider.review()`. Claude's SDK
accepts an abort controller. Codex needs matching child-process termination.
The worker checks the signal before claiming another job.

Repeated provider-level failures should pause the provider worker instead of
walking the rest of the queue. Persist the pause or circuit-breaker deadline so
a restart does not immediately repeat the same failure across more PRs.

## Queue UX

The main table should have separate **Human review** and **AI review** columns.

Recommended URL-backed filters:

```text
?human=mine
?human=awaiting-review
?human=changes-requested
?ai=not-requested
?ai=queued
?ai=failed
?ai=completed
```

Useful actions:

- **Review with AI** for not requested, failed, skipped, and cancelled states.
- **Review selected** for explicit backlog work.
- **Cancel** for queued, retrying, and running jobs.
- **Retry** with the stored safe failure message visible.

The first real sync should show progress such as `Importing 168 open pull
requests`. After it finishes, the queue should show all 168 without running a
model. A banner can offer `Review selected` and explain that new PRs will be
reviewed automatically when the setting is on.

## Per-PR UX and diff

The per-PR route resolves from inventory, not from a judgment.

Before an AI run, it should show:

- PR metadata and age
- review activity or open signals
- current AI state
- **Review with AI**
- **Open on GitHub**
- a **Files changed** tab

After a completed current-head run, **Decisions** remains the default because
that question-by-question workflow is Komodo's product. **Whole review** and
**Files changed** remain secondary URL-backed views. A previous-head review is
shown as historical and must never look current.

A full diff should load only when someone opens **Files changed** or when the
AI reviewer already needs the files. Cache normalized files by
`(prId, headSha)`:

```ts
interface DiffSnapshot {
  prId: string;
  headSha: string;
  files: Array<{
    path: string;
    status: string;
    additions: number;
    deletions: number;
    patch: string | null;
  }>;
  fetchedAt: number;
}
```

For the current head with no run, fetch from GitHub through a server-only
credential boundary and cache through the port. Never serialize the token.
For `?run=<sha>&view=files`, render the immutable `review_files` that the
selected run read. Large or binary files can have `patch: null`; the UI should
link those files to GitHub instead of pretending a diff exists.

The first local viewer only needs file navigation, unified hunks, line
numbers, and links from a judgment to its file and line. Split diff, syntax
highlighting, and inline conversation can follow after the data path is
correct.

## Module ownership

```text
packages/store/src/
  port.ts                 domain contracts
  types.ts                job, attempt, sync, overview, and diff types
  sqlite.ts               transactional SQLite implementation
  postgres.ts             transactional Postgres implementation
  test/conformance.ts     identical lifecycle and baseline proofs

packages/ingest/src/
  inventory.ts            inventory poller and GitHub adapter
  worker.ts               claims, leases, cancellation, and provider calls
  retry.ts                pure failure classification and retry policy
  settings.ts             review policy mapping
  loop.ts                 starts independent poller and worker loops

apps/web/src/
  lib/data/queries.ts     derives human and AI display states
  lib/data/actions.ts     request, retry, cancel, and diff actions
  components/queue/       inventory table
  components/review/      overview, decisions, whole review, and files tabs
```

## Migration

The migration must avoid creating an upgrade-time backlog:

- Preserve every raw pull request, judgment, review, answer, vote, and finding.
- Treat a current-head completed or skipped judgment as a completed or skipped
  outcome without rerunning it.
- Convert a current-head `pending` judgment into a queued job.
- Convert current-head `error` and `usage_limit` judgments into failed jobs
  that require explicit retry.
- Treat a current head with no judgment as not requested.
- Establish the baseline for repositories that already contain pull requests.
- Leave a new or empty repository without a baseline until its first complete
  listing.
- Keep previous-head judgments as history only.

## Delivery plan

### 1. Make inventory truthful

- Add raw PR overviews to the port and snapshot.
- Join current judgment on both PR ID and head SHA.
- Make the queue, pull-request list, and per-PR route work without a judgment.
- Add conformance tests for unreviewed visibility, one row per PR, and
  current-head selection.

This phase fixes the false empty queue without changing review scheduling.

### 2. Stop automatic historical review

- Add per-repository baseline state.
- Add durable review jobs and manual request actions.
- Migrate existing status rows using the rules above.
- Change the worker to claim only explicit jobs.
- Add `autoReviewNewPullRequests` to settings and the settings seam.

This phase makes the first sync model-free and newcomers automatic.

### 3. Split the loops and make shutdown safe

- Run inventory polling and the worker independently.
- Add claims, attempts, leases, bounded retry, and provider pause.
- Pass cancellation through every external boundary.
- Fix the web-child exit race in `serve()`.

### 4. Separate human and AI UX

- Refresh same-head listing facts.
- Add Human review and AI review columns and URL filters.
- Add request, bulk request, cancel, and retry actions.
- Show safe failure reasons and next retry times.

### 5. Add the on-demand diff

- Add current-head diff fetch and cache.
- Add the URL-backed Files changed view.
- Reuse immutable review files for historical runs.
- Open the route against a real SQLite store and a real Postgres store.

### 6. Add richer open signals

- Batch review decision, required checks, merge state, and conflicts from
  GitHub.
- Derive the Open signals panel from those facts.
- Keep the wording honest when no blocker is observed.

## Verification

The store conformance suite should cover:

- First successful repository sync imports but queues nothing.
- Repeating or resuming a partial baseline queues nothing.
- A later new PR queues exactly once.
- A later head queues according to `autoReviewNewCommits`.
- Manual request is idempotent for `(prId, headSha)`.
- One worker claims a job; a second cannot claim it.
- An expired lease becomes claimable.
- Completion writes the whole review and completes the attempt atomically.
- Shutdown interruption does not consume a retry.
- Failed and limited jobs respect retry timing or manual retry.
- Snapshot has one row per PR and uses only the current-head result.
- Historical review runs remain readable.

Runtime verification should prove:

- Starting against a repository with a large backlog makes zero provider calls.
- The queue shows that backlog after the first inventory sync.
- A later new PR produces one provider call.
- Poll timestamps continue to advance while a deliberately slow review runs.
- Ctrl+C stops the active provider and never starts another PR.
- Repeated provider termination failures open the provider circuit before the
  worker walks the remaining pull requests.
- The unreviewed per-PR route and current diff render against a real store.

Before shipping, run the repository verification bar:

```text
pnpm typecheck
pnpm lint
pnpm build
pnpm -r test
```

Then open every changed route against both SQLite and Postgres-backed real
stores.

## Alternatives considered

### Keep the current implicit work list

This keeps the smallest code change, but absence of a completed judgment still
authorizes model spending. It cannot represent an imported, intentionally
deferred pull request.

### Reuse pending judgments as durable intent

This design can separate the two loops with fewer tables. It cannot truthfully
distinguish queued from running, keep attempt history, schedule retry, recover
a stale claim, or support more than one worker. It also keeps worker lifecycle
inside the AI result type. Those limitations conflict with the queue state and
failure UX required here.

### Keep jobs only in memory

The web and ingester run in separate processes, and a restart would lose or
duplicate work. An in-memory queue breaks the store-mediated restart behavior
that Komodo already values.

### Fetch every diff during baseline

This would make the detail page immediate, but turns the first inventory sync
into a large patch download. Lazy current-head diffs preserve the cheap,
model-free baseline.

## Tradeoffs accepted

- Two new lifecycle tables add SQL work, but they remove placeholder judgments
  and make queue state recoverable.
- Transactional port methods make each driver more involved, but callers get a
  smaller interface and cannot split invariant updates.
- The first current-head diff can take one GitHub round trip, but the baseline
  does not download 168 diffs nobody opened.
- Baseline reviews are always explicit, so a team that wants all history must
  select it. This is the right side of an expensive default.
- Initial concurrency is one. Higher concurrency should be an explicit budget
  decision after usage is measured.

## Product questions to settle before implementation

Recommended answers are included so implementation can proceed unless product
evidence says otherwise.

1. What is a newcomer? Use first observed after that repository's successful
   baseline, not GitHub `createdAt`.
2. Should an old baseline PR with a new head auto-review? Yes, when
   `autoReviewNewCommits` is enabled. The changed head is new work.
3. Should draft-to-ready auto-review? Yes, when drafts were excluded and the
   transition happens after baseline.
4. Should a reopened PR auto-review? Default off until usage supports it.
5. Should manual review obey automatic filters? Keep hard file and path safety
   limits. Let a person override author, title, and draft filters because the
   request is explicit.
6. Should existing installations auto-review new PRs after migration? Yes, but
   only after already-known repositories receive upgrade baselines.
7. What automatic review budget should ship? Start with concurrency one and no
   historical jobs. Add a count or provider-reported budget only after Komodo
   can measure actual usage.
8. Is a GitHub-style diff the per-PR default? No. Before AI, default to
   Overview. After a current-head AI result, default to Decisions. Files
   changed remains one click away.

## Evidence and gaps

Direct evidence came from the current implementation and tests, the ingest
[history](https://github.com/Delavalom/komodo/commit/72b7fa61234f4f7ff0c49ab890f9a6293e375c64),
the store's idempotency
[history](https://github.com/Delavalom/komodo/commit/12f59e9071a487b94063125b28a51a052f31596e),
the original queue
[history](https://github.com/Delavalom/komodo/commit/8d14905d895476893f8a180db0549cc0d9807dac),
the CLI startup
[history](https://github.com/Delavalom/komodo/commit/b725e8a52b5c7cba9252d1912187a6311e7d0201),
and GitHub pull requests
[#3](https://github.com/Delavalom/komodo/pull/3),
[#4](https://github.com/Delavalom/komodo/pull/4), and
[#5](https://github.com/Delavalom/komodo/pull/5). GitHub has no issues for this
topic. The pull requests contain no discussion of initial backfill, token
budgets, retry limits, or cancellation.

Notion searches for Komodo polling, first-run backfill, token cost, and human
versus AI queue state returned no relevant documents. No real-time chat,
infrastructure-observability, error-tracking, or product-analytics source was
available in this environment. The identity of the process that sent the
earlier `SIGTERM` remains unknown.
