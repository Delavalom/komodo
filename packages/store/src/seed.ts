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
import type { FindingInput, KomodoStore } from "./port.js";
import type {
  ImpactLevel,
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

const FINDING_TITLES = [
  "Unvalidated user input reaches the SQL builder",
  "Missing null check before dereferencing the session",
  "Race condition between the two sync workers",
  "Secret is logged at info level",
  "Off-by-one in the pagination offset",
  "Unbounded retry loop on a 5xx response",
  "Timezone assumed to be UTC in a local-time context",
  "Error swallowed by an empty catch block",
  "N+1 query inside the row renderer",
  "Regex is vulnerable to catastrophic backtracking",
  "Response cached without a user-scoped key",
  "Float used for a currency amount",
] as const;

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

/**
 * The call, derived from the same numbers the reader sees. A judgment that
 * disagreed with its own score would be worse than no judgment at all.
 */
function verdictFor(
  status: ReviewStatus,
  score: number,
  impact: ImpactLevel,
): Verdict | null {
  if (status !== "completed") return null;
  if (score >= 5) return "ship";
  if (score >= 4) return impact === "critical" ? "needs_work" : "ship_with_notes";
  if (score >= 2) return "needs_work";
  return "blocked";
}

/** A believable 40-hex head. Only its stability across a poll matters. */
function fakeSha(next: () => number): string {
  let out = "";
  for (let i = 0; i < 40; i++) out += "0123456789abcdef"[Math.floor(next() * 16)];
  return out;
}

const OWNER = "delavalom";

export interface SeedOptions {
  /** Pinned so the dataset does not drift between runs. */
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
  const now = options.now ?? Date.UTC(2026, 7, 18, 12, 0, 0);
  const you = options.you ?? AUTHORS[0];

  await store.setOrganization({
    slug: "delavalom-labs",
    name: "Delavalom Labs",
    role: "admin",
    trialEndsAt: Date.UTC(2026, 7, 31, 12, 0, 0),
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

    const totalComments = status === "completed" ? Math.floor(next() * 9) : 0;
    const judgmentId = await store.upsertJudgment({
      prId,
      headSha,
      verdict: verdictFor(status, score, impact),
      status,
      impact,
      score,
      counters: {
        reviewCount: status === "completed" ? 1 + Math.floor(next() * 3) : 0,
        totalComments,
        addressedComments:
          totalComments === 0 ? 0 : Math.floor(next() * (totalComments + 1)),
        upvotes: Math.floor(next() * 4),
        downvotes: next() < 0.18 ? 1 : 0,
      },
    });

    if (status === "completed") {
      await store.replaceFindings(judgmentId, buildFindings(judgmentId));
    }
  }
}

function buildFindings(judgmentId: string): FindingInput[] {
  const next = rng(`finding:${judgmentId}`);
  const count = next() < 0.42 ? 0 : 1 + Math.floor(next() * 3);
  return Array.from({ length: count }, () => {
    const r = next();
    const severity: Severity = r < 0.14 ? "P0" : r < 0.48 ? "P1" : "P2";
    return {
      title: pick(next, FINDING_TITLES),
      body:
        "Komodo flagged this while reviewing the diff. " +
        "Push back if it's wrong — it has no feelings.",
      severity,
      isSecurity: next() < 0.22,
      filePath: pick(next, FINDING_FILES),
    };
  });
}
