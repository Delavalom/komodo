/**
 * The dev dataset.
 *
 * `komodo dev` with no GitHub token still has to show a queue, or the first
 * thing anyone sees is an empty table. This writes a plausible team's worth of
 * review history straight through the port, so the same seeding works on any
 * driver.
 *
 * Everything derives from a string-seeded PRNG, so re-seeding twice produces
 * byte-identical rows and two runs stay comparable.
 */
import { DAY_MS, pick, rng } from "./rand.js";
import { verdictFor } from "./verdict.js";
import type { FindingInput, KomodoStore, ReviewInput } from "./port.js";
import type {
  Bucket,
  ImpactLevel,
  JudgementSeverity,
  Member,
  PullRequestState,
  ReviewStatus,
  Severity,
  Verdict,
} from "./types.js";

const REPO_NAMES = [
  "komodo",
  "gramkit",
  "railpack",
  "marketing",
  "jobs",
  "market-hq-dbt",
  "ahq",
  "arvlang",
  "blender-mcp",
  "buildolatam",
  "chatbots-gpt",
  "clone-notion-ai",
  "7-labs",
  "7exchange-waitlist",
  "61149",
] as const;

const AUTHORS = [
  "Delavalom",
  "mgutierrez",
  "kbrennan",
  "s-okonkwo",
  "rvasquez",
  "jlindqvist",
] as const;

const TITLE_SHAPES: readonly ((next: () => number) => string)[] = [
  (n) => `feat(${pick(n, SCOPES)}): ${pick(n, FEATURES)}`,
  (n) => `fix(${pick(n, SCOPES)}): ${pick(n, FIXES)}`,
  (n) => `refactor(${pick(n, SCOPES)}): ${pick(n, REFACTORS)}`,
  (n) => `chore(deps): bump ${pick(n, DEPS)}`,
  (n) => `perf(${pick(n, SCOPES)}): ${pick(n, PERFS)}`,
  (n) => `docs: ${pick(n, DOCS)}`,
  (n) => `test(${pick(n, SCOPES)}): ${pick(n, TESTS)}`,
];

const SCOPES = [
  "state", "api", "auth", "ui", "db", "worker", "router", "billing",
  "cache", "search", "webhooks", "editor",
] as const;

const FEATURES = [
  "remove obsolete state files and add new session data",
  "add cursor-based pagination to the list endpoint",
  "support multi-tenant workspace switching",
  "introduce a background retry queue",
  "add optimistic updates to the compose flow",
  "expose per-repo review settings",
  "add keyboard shortcuts to the results table",
  "stream partial responses from the agent",
  "persist filter chips to the query string",
  "add a dry-run mode to the migration CLI",
] as const;

const FIXES = [
  "guard against a null repository on first render",
  "stop double-counting reviews on re-trigger",
  "correct the timezone used for daily buckets",
  "avoid a race when two syncs overlap",
  "escape glob characters in file patterns",
  "restore focus after closing the drawer",
  "handle 429s from the provider with backoff",
  "clamp the confidence score to 0..5",
] as const;

const REFACTORS = [
  "extract the pagination hook",
  "collapse three near-identical selectors",
  "move formatters out of the component tree",
  "replace the ad-hoc cache with an LRU",
  "split the settings page into sections",
] as const;

const PERFS = [
  "memoize the derived analytics series",
  "batch the per-row status queries",
  "drop an unnecessary full-table scan",
  "lazy-load the diagram renderer",
] as const;

const DOCS = [
  "document the webhook payload shape",
  "add a runbook for failed syncs",
  "explain the credit accounting model",
] as const;

const TESTS = [
  "cover the empty-result path",
  "add regression tests for the filter parser",
  "assert the URL encoding round-trips",
] as const;

const DEPS = [
  "next from 16.2.0 to 16.3.1",
  "zod from 3.24.1 to 3.25.0",
  "typescript from 5.7.2 to 5.8.3",
  "eslint from 9.18.0 to 9.22.0",
] as const;

const STATUS_WEIGHTS: readonly [ReviewStatus, number][] = [
  ["completed", 0.78],
  ["pending", 0.08],
  ["skipped", 0.07],
  ["error", 0.04],
  ["usage_limit", 0.02],
  ["trial_ended", 0.01],
];

function weightedStatus(r: number): ReviewStatus {
  let acc = 0;
  for (const [status, weight] of STATUS_WEIGHTS) {
    acc += weight;
    if (r < acc) return status;
  }
  return "completed";
}

function weightedImpact(r: number): ImpactLevel {
  if (r < 0.46) return "low";
  if (r < 0.78) return "medium";
  if (r < 0.94) return "high";
  return "critical";
}

/**
 * The judgements the dev dataset is built from.
 *
 * A judgement, not a defect report: each states what is true, then puts one
 * question to the reader with two real answers. The third and fourth options
 * are fixed by the schema — ask first, or hand it on — and are added below.
 *
 * The findings table is derived from these rather than generated beside them,
 * for the same reason packages/ingest/src/map.ts derives it in production: two
 * generators would eventually disagree, and the queue would contradict the
 * page it links to.
 */
const JUDGEMENT_SHAPES = [
  {
    title: "Unvalidated user input reaches the SQL builder",
    kind: "Risk", tag: "changes how queries are built",
    lede: "A caller-supplied string is interpolated into the query rather than bound.",
    detail: "Binding it costs nothing here; the builder already takes parameters.",
    ask: "Is this input trusted enough to interpolate?",
    yes: "It is internal — leave it", no: "Bind it as a parameter",
    path: "src/server/db/query.ts",
  },
  {
    title: "Missing null check before dereferencing the session",
    kind: "Behaviour", tag: "changes what an expired session does",
    lede: "An expired session now throws where it used to redirect to sign-in.",
    detail: "The redirect was two lines up before this change moved the read.",
    ask: "Should an expired session throw here?",
    yes: "Yes — the caller handles it", no: "Restore the redirect",
    path: "src/lib/auth/session.ts",
  },
  {
    title: "Race condition between the two sync workers",
    kind: "Risk", tag: "changes how the workers coordinate",
    lede: "Both workers can claim the same row between the read and the write.",
    detail: "A conditional update on the version column would close the window.",
    ask: "Can two workers ever run against this table at once?",
    yes: "No — only one runs", no: "Claim the row conditionally",
    path: "packages/worker/src/sync.ts",
  },
  {
    title: "Secret is logged at info level",
    kind: "Risk", tag: "changes what reaches the logs",
    lede: "The token is written to a log line that ships to the aggregator.",
    detail: "Logging its last four characters would keep the line useful.",
    ask: "Should this token reach the log aggregator?",
    yes: "It is a test token", no: "Redact it before logging",
    path: "src/lib/auth/session.ts",
  },
  {
    title: "Off-by-one in the pagination offset",
    kind: "Choice", tag: "changes which row a page starts on",
    lede: "The offset is computed from a one-based page but used as zero-based.",
    detail: "The first row of every page after the first is skipped.",
    ask: "Is the page number one-based here?",
    yes: "It is zero-based — this is fine", no: "Subtract one from the page",
    path: "src/app/api/reviews/route.ts",
  },
  {
    title: "Unbounded retry loop on a 5xx response",
    kind: "Risk", tag: "changes how failures are retried",
    lede: "A persistent 5xx retries forever, holding the connection open.",
    detail: "A ceiling of five with backoff matches the other callers here.",
    ask: "Should this retry without a ceiling?",
    yes: "Yes — it must eventually succeed", no: "Cap it at five attempts",
    path: "packages/core/src/retry.ts",
  },
  {
    title: "Timezone assumed to be UTC in a local-time context",
    kind: "Domain", tag: "reaches outside this change",
    lede: "The date is formatted in UTC but read by users in their own zone.",
    detail: "Everything downstream of this formatter inherits the assumption.",
    ask: "Is UTC the right zone for what the reader sees?",
    yes: "Yes — it is a server timestamp", no: "Format in the viewer's zone",
    path: "src/lib/format/date.ts",
  },
  {
    title: "Error swallowed by an empty catch block",
    kind: "Choice", tag: "changes what happens on failure",
    lede: "A failure here now leaves no trace: no log, no rethrow, no metric.",
    detail: "The caller cannot tell a failed run from an empty one.",
    ask: "Should this failure stay invisible?",
    yes: "Yes — it is expected and harmless", no: "Log it before continuing",
    path: "packages/worker/src/sync.ts",
  },
  {
    title: "N+1 query inside the row renderer",
    kind: "Choice", tag: "changes how the table loads",
    lede: "Each rendered row issues its own query for the author.",
    detail: "One query up front and a map would collapse it, at the cost of a join.",
    ask: "Is a query per row acceptable at this table's size?",
    yes: "Yes — it is never long", no: "Fetch the authors in one query",
    path: "src/components/table/row.tsx",
  },
  {
    title: "Regex is vulnerable to catastrophic backtracking",
    kind: "Risk", tag: "changes how input is matched",
    lede: "Nested quantifiers make a crafted string take exponential time.",
    detail: "Anchoring the inner group removes the ambiguity outright.",
    ask: "Can untrusted input reach this pattern?",
    yes: "No — the input is generated", no: "Anchor the inner group",
    path: "src/lib/format/date.ts",
  },
  {
    title: "Response cached without a user-scoped key",
    kind: "Risk", tag: "changes who sees a cached response",
    lede: "One user's response can be served to another from the shared cache.",
    detail: "Adding the user id to the key costs one string concatenation.",
    ask: "Is this response identical for every user?",
    yes: "Yes — it is public data", no: "Scope the key to the user",
    path: "src/lib/cache/index.ts",
  },
  {
    title: "Float used for a currency amount",
    kind: "Choice", tag: "changes how money is stored",
    lede: "Amounts are held as floats, so totals drift by fractions of a cent.",
    detail: "Integer minor units are what the rest of the billing code uses.",
    ask: "Should money be a float here?",
    yes: "Yes — it is only ever displayed", no: "Store minor units as integers",
    path: "src/server/db/query.ts",
  },
] as const;

const FINDING_TITLES = JUDGEMENT_SHAPES.map((s) => s.title);

const FINDING_FILES = [
  "src/server/db/query.ts",
  "src/app/api/reviews/route.ts",
  "packages/worker/src/sync.ts",
  "src/lib/auth/session.ts",
  "src/components/table/row.tsx",
  "packages/core/src/retry.ts",
  "src/lib/format/date.ts",
  "src/lib/cache/index.ts",
] as const;

const PR_COUNT = 184;
const WINDOW_DAYS = 120;

/** A believable 40-hex head. Only its stability across a poll matters. */
function fakeSha(next: () => number): string {
  let out = "";
  for (let i = 0; i < 40; i++) out += "0123456789abcdef"[Math.floor(next() * 16)];
  return out;
}

const OWNER = "delavalom";

export interface SeedOptions {
  /**
   * The instant the dataset is written around. Defaults to the real clock.
   *
   * Ages are what the queue is read for — what has been waiting three days,
   * what has gone stale — so a dataset anchored to a constant looks fine the
   * week it was written and increasingly like an abandoned queue after that.
   * The *shape* stays deterministic either way: every value still comes from
   * `rng(seed)`, and only the instant they are measured from moves. A test
   * that needs a fixed dataset passes one.
   */
  now?: number;
  /** Which login the UI should treat as the signed-in user. */
  you?: string;
}

/**
 * Writes the whole dev dataset through the port. Idempotent: every id is
 * derived, so seeding an already-seeded database updates in place rather than
 * doubling it.
 */
export async function seedStore(
  store: KomodoStore,
  options: SeedOptions = {},
): Promise<void> {
  const now = options.now ?? Date.now();
  const you = options.you ?? AUTHORS[0];

  await store.setOrganization({
    slug: "delavalom-labs",
    name: "Delavalom Labs",
    role: "admin",
    trialEndsAt: now + 13 * DAY_MS,
    plan: "trial",
  });

  const repoIds: string[] = [];
  for (const name of REPO_NAMES) {
    repoIds.push(
      await store.upsertRepository({
        id: `${OWNER}/${name}`,
        owner: OWNER,
        name,
        provider: "github",
        enabled: true,
        reviewCount: 0,
      }),
    );
  }

  const memberIds: string[] = [];
  for (const login of AUTHORS) {
    memberIds.push(
      await store.saveMember({
        id: `member_${login.toLowerCase()}`,
        email: `${login.toLowerCase()}@delavalom.dev`,
        name: login,
        githubLogin: login,
        role: login === you ? "admin" : "member",
        avatarSeed: login,
        isYou: login === you,
      } satisfies Omit<Member, "id"> & { id: string }),
    );
  }

  await store.saveTeam({
    id: "team_core",
    name: "Core",
    memberIds,
    watchedRepoIds: repoIds,
  });

  const perRepoNumber = new Map<string, number>();

  for (let i = 0; i < PR_COUNT; i++) {
    const next = rng(`pr:${i}`);
    // Bias toward recent so chart density matches a live account.
    const ageDays = Math.floor(Math.pow(next(), 2.1) * WINDOW_DAYS);
    const jitter = Math.floor(next() * DAY_MS);
    const updatedAt = now - ageDays * DAY_MS - jitter;
    const openFor = 1 + Math.floor(next() * 14);
    const createdAt = updatedAt - openFor * DAY_MS;

    const repoId = pick(next, repoIds);
    const repoName = repoId.split("/")[1];
    const number = (perRepoNumber.get(repoId) ?? 0) + 1;
    perRepoNumber.set(repoId, number);

    const status = weightedStatus(next());
    const impact = weightedImpact(next());
    const score = status === "completed" ? 1 + Math.floor(next() * 5) : 0;
    const merged = status === "completed" && next() < 0.82;
    const state: PullRequestState = merged
      ? "merged"
      : next() < 0.12
        ? "closed"
        : "open";

    const author = pick(next, AUTHORS);
    // Reviewers are teammates other than the author — the join the queue
    // needs to answer "is this waiting on me?".
    const others = AUTHORS.filter((a) => a !== author);
    const reviewerCount = state === "open" ? 1 + Math.floor(next() * 2) : 1;
    const requestedReviewers = [...new Set(
      Array.from({ length: reviewerCount }, () => pick(next, others)),
    )];
    const approvals = merged ? [pick(next, others)] : [];
    const changesRequested =
      !merged && next() < 0.14 ? [pick(next, others)] : [];

    const headSha = fakeSha(next);
    const prId = await store.upsertPullRequest({
      id: `${repoId}#${number}`,
      repoId,
      number,
      title: pick(next, TITLE_SHAPES)(next),
      author,
      url: `https://github.com/${OWNER}/${repoName}/pull/${number}`,
      headSha,
      state,
      isDraft: state === "open" && next() < 0.08,
      requestedReviewers,
      approvals,
      changesRequested,
      additions: Math.floor(next() * 400),
      deletions: Math.floor(next() * 160),
      changedFiles: 1 + Math.floor(next() * 18),
      createdAt,
      updatedAt,
      mergedAt: merged ? updatedAt : null,
    });

    const judgmentId = await store.upsertJudgment({
      prId,
      headSha,
      verdict: verdictFor(status, score, impact),
      status,
      impact,
      score,
    });

    if (status === "completed") {
      // The body first, then the findings derived from it — the same order,
      // and the same direction of dependency, as a real review run.
      const judgements = buildJudgements(judgmentId);
      const reviewId = await store.saveReview(
        // The dev dataset has no provider login behind it, and saying so beats
        // claiming a subscription nobody connected.
        buildReview({ prId, headSha, judgements, score, provider: "seed" }),
      );
      // After the review: a finding names the judgement it summarises, and
      // that id is `${reviewId}:${ordinal}`.
      await store.replaceFindings(judgmentId, findingsFrom(reviewId, judgements));

      // Engagement used to be five numbers written straight onto the judgment,
      // which is why they were fiction anywhere but here. They are counted at
      // read time now, so a lived-in dataset has to be lived in: some of these
      // judgements were actually answered, and some were actually voted on.
      await seedEngagement(store, reviewId, judgements.length, others);
    }
  }
}

/**
 * Answers and votes for a seeded run.
 *
 * Deliberately partial — a queue where everything is decided has nothing to
 * show, and the addressed rate is only interesting when it is not 100%.
 */
async function seedEngagement(
  store: KomodoStore,
  reviewId: string,
  count: number,
  reviewers: readonly string[],
): Promise<void> {
  const next = rng(`engagement:${reviewId}`);

  for (let ordinal = 0; ordinal < count; ordinal++) {
    const judgementId = `${reviewId}:${ordinal}`;
    const actor = pick(next, reviewers);

    if (next() < 0.55) {
      const roll = next();
      const [bucket, optionLabel]: [Bucket, string] =
        roll < 0.55
          ? ["Agreed", "Yes — worth changing"]
          : roll < 0.78
            ? ["Asked", "I have a question first"]
            : roll < 0.92
              ? ["Blocks", "No — this has to change first"]
              : ["Passed on", "Not my call — hand it on"];

      await store.recordAnswer({
        judgementId,
        actorLogin: actor,
        bucket,
        optionLabel,
        note:
          bucket === "Asked"
            ? "Does this hold when the cache is cold?"
            : null,
        blocking: bucket === "Blocks",
      });
    }

    if (next() < 0.4) {
      await store.recordVote({
        judgementId,
        actorLogin: actor,
        value: next() < 0.78 ? 1 : -1,
      });
    }
  }
}

type SeededJudgement = ReviewInput["judgements"][number];

function buildJudgements(judgmentId: string): SeededJudgement[] {
  const next = rng(`finding:${judgmentId}`);
  const count = next() < 0.42 ? 0 : 1 + Math.floor(next() * 3);
  // Distinct shapes: the same question twice in one review reads as a bug.
  const taken = new Set<number>();
  const out: SeededJudgement[] = [];

  for (let i = 0; i < count; i++) {
    let index = Math.floor(next() * JUDGEMENT_SHAPES.length);
    while (taken.has(index)) index = (index + 1) % JUDGEMENT_SHAPES.length;
    taken.add(index);

    const shape = JUDGEMENT_SHAPES[index];
    const r = next();
    const severity: JudgementSeverity =
      r < 0.14 ? "critical" : r < 0.48 ? "major" : r < 0.86 ? "minor" : "trivial";
    const line = 12 + Math.floor(next() * 180);

    out.push({
      path: shape.path,
      line,
      endLine: null,
      severity,
      kind: shape.kind,
      tag: shape.tag,
      title: `${shape.title}.`,
      lede: shape.lede,
      detail: shape.detail,
      ask: shape.ask,
      sources: ["the diff"],
      sourceNote: "Read from the diff alone; nothing else was given.",
      code: `${shape.path}:${line}`,
      options: [
        { label: shape.yes, bucket: "Agreed" },
        { label: shape.no, bucket: "Blocks" },
        { label: "I have a question first", bucket: "Asked" },
        { label: "Not my call — hand it on", bucket: "Passed on" },
      ],
      suggestion: null,
      fixPrompt: `${shape.no}. ${shape.detail}`,
      // One judgement in six sits on a line GitHub could not have commented
      // on. Those are exactly the ones only this app can show.
      postable: next() > 0.16,
    });
  }
  return out;
}

function buildReview(args: {
  prId: string;
  headSha: string;
  judgements: SeededJudgement[];
  score: number;
  provider: string;
}): ReviewInput {
  const { prId, headSha, judgements, score, provider } = args;
  const paths = [...new Set(judgements.map((j) => j.path))];
  return {
    prId,
    headSha,
    provider,
    model: null,
    summary: judgements.length
      ? judgements.map((j) => `- ${j.tag}`).join("\n")
      : "- No behaviour changed that needed a judgement.",
    walkthrough: paths.map((path) => ({
      files: [path],
      summary:
        judgements.find((j) => j.path === path)?.lede ??
        "Touched without changing behaviour.",
    })),
    confidence: Math.round(score),
    effort: 1 + Math.min(4, judgements.length),
    verdictLine: judgements.length
      ? "Ready once the questions below are answered."
      : "Nothing here needs a decision.",
    diagram: null,
    recordId: `seed-${prId}@${headSha}`,
    files: paths.map((path) => ({
      path,
      additions: 0,
      deletions: 0,
      status: "modified",
      // The dev dataset has no real diff to show. The page says so rather
      // than inventing one.
      patch: null,
    })),
    judgements,
  };
}

/** core has four severities; a finding row has three. trivial folds into P2. */
const FINDING_SEVERITY: Record<JudgementSeverity, Severity> = {
  critical: "P0",
  major: "P1",
  minor: "P2",
  trivial: "P2",
};

const SECURITY_TERMS =
  /\b(auth|credential|escap|injection|leak|log|secret|security|session|token|cache)/i;

function findingsFrom(
  reviewId: string,
  judgements: SeededJudgement[],
): FindingInput[] {
  return judgements.map((j, ordinal) => ({
    judgementId: `${reviewId}:${ordinal}`,
    title: j.title.replace(/\.$/, ""),
    body: [j.lede, j.detail, j.ask].join("\n\n"),
    severity: FINDING_SEVERITY[j.severity],
    isSecurity: SECURITY_TERMS.test(`${j.tag} ${j.title} ${j.lede}`),
    filePath: j.path,
  }));
}
