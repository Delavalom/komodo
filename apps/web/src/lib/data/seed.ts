/**
 * Deterministic dummy dataset. docs/SPEC.md §12.
 *
 * Components never import this file — they go through lib/data/queries.ts.
 * Everything is derived from a hash-seeded PRNG and the pinned NOW, so the
 * server and the client render byte-identical output.
 */
import { DAY_MS, NOW, pick, rng, startOfDay } from "@/lib/utils";
import type {
  ApiKey,
  Finding,
  Integration,
  Member,
  MemoryRule,
  Organization,
  OrgSettings,
  PersonalSettings,
  PullRequest,
  RepoCluster,
  Repository,
  Severity,
  ReviewStatus,
  ImpactLevel,
} from "@/lib/types";

export const ORG: Organization = {
  slug: "delavalom-labs",
  name: "Delavalom Labs",
  role: "admin",
  trialEndsAt: Date.UTC(2026, 7, 31, 12, 0, 0),
  plan: "trial",
};

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

export const REPOS: Repository[] = REPO_NAMES.map((name, i) => {
  return {
    id: `repo_${i + 1}`,
    owner: "delavalom",
    name,
    provider: "github" as const,
    enabled: true,
    reviewCount: 0, // filled in below from the PR list
  };
});

export const repoFullName = (repo: Repository) => `${repo.owner}/${repo.name}`;

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

const PR_COUNT = 184;
const WINDOW_DAYS = 120;

function buildPullRequests(): PullRequest[] {
  const out: PullRequest[] = [];
  const perRepoNumber = new Map<string, number>();

  for (let i = 0; i < PR_COUNT; i++) {
    const next = rng(`pr:${i}`);
    // Bias toward recent so chart density matches a live account.
    const ageDays = Math.floor(Math.pow(next(), 2.1) * WINDOW_DAYS);
    const jitter = Math.floor(next() * DAY_MS);
    const updatedAt = NOW - ageDays * DAY_MS - jitter;
    const openFor = 1 + Math.floor(next() * 14);
    const createdAt = updatedAt - openFor * DAY_MS;

    const repo = pick(next, REPOS);
    const number = (perRepoNumber.get(repo.id) ?? 0) + 1;
    perRepoNumber.set(repo.id, number);

    const status = weightedStatus(next());
    const reviewCount = status === "completed" ? 1 + Math.floor(next() * 3) : 0;
    const totalComments =
      status === "completed" ? Math.floor(next() * 9) : 0;
    const addressedComments =
      totalComments === 0 ? 0 : Math.floor(next() * (totalComments + 1));
    const merged = status === "completed" && next() < 0.82;

    out.push({
      id: `pr_${i + 1}`,
      repoId: repo.id,
      number,
      title: pick(next, TITLE_SHAPES)(next),
      author: pick(next, AUTHORS),
      url: `https://github.com/${repo.owner}/${repo.name}/pull/${number}`,
      createdAt,
      updatedAt,
      mergedAt: merged ? updatedAt : null,
      reviewCount,
      impact: weightedImpact(next()),
      status,
      score: status === "completed" ? 1 + Math.floor(next() * 5) : 0,
      addressedComments,
      totalComments,
      upvotes: Math.floor(next() * 4),
      downvotes: next() < 0.18 ? 1 : 0,
    });
  }

  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export const PULL_REQUESTS: PullRequest[] = buildPullRequests();

for (const repo of REPOS) {
  repo.reviewCount = PULL_REQUESTS.filter(
    (pr) => pr.repoId === repo.id,
  ).reduce((sum, pr) => sum + pr.reviewCount, 0);
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

function buildFindings(): Finding[] {
  const out: Finding[] = [];
  const reviewed = PULL_REQUESTS.filter((pr) => pr.status === "completed");
  let id = 0;

  for (const pr of reviewed) {
    const next = rng(`finding:${pr.id}`);
    const count = next() < 0.42 ? 0 : 1 + Math.floor(next() * 3);
    for (let i = 0; i < count; i++) {
      const r = next();
      const severity: Severity = r < 0.14 ? "P0" : r < 0.48 ? "P1" : "P2";
      const s = next();
      out.push({
        id: `finding_${++id}`,
        prId: pr.id,
        title: pick(next, FINDING_TITLES),
        body:
          "Greptile flagged this while reviewing the diff. " +
          "Push back if it's wrong — it has no feelings.",
        severity,
        isSecurity: next() < 0.22,
        status: s < 0.46 ? "addressed" : s < 0.86 ? "open" : "dismissed",
        filePath: pick(next, FINDING_FILES),
        createdAt: pr.updatedAt - Math.floor(next() * DAY_MS),
      });
    }
  }

  return out.sort((a, b) => b.createdAt - a.createdAt);
}

export const FINDINGS: Finding[] = buildFindings();

/* ── Memory ─────────────────────────────────────────────────────────────── */

const CLAUDE_GLOB = "{CLAUDE.md,Claude.md,claude.md,**/CLAUDE.md,**/claude.md}";
const CURSOR_GLOB = "{.cursor/rules/**/*.mdc,.cursorrules}";
const AGENTS_GLOB = "{AGENTS.md,Agents.md,agents.md,**/AGENTS.md}";

const FILE_RULE_SHAPES = [
  { description: "CLAUDE.md files", pattern: CLAUDE_GLOB, file: "CLAUDE.md" },
  {
    description: "Cursor Project Rules",
    pattern: CURSOR_GLOB,
    file: ".cursor/rules/project.mdc",
  },
  {
    description: "Cursor Legacy Rules",
    pattern: ".cursorrules",
    file: ".cursorrules",
  },
  { description: "Agents.md files", pattern: AGENTS_GLOB, file: "AGENTS.md" },
] as const;

const WRITTEN_RULES = [
  "What: Using logging instead of printing log messages\nWhy: We can't filter log messages\nGood: logging.error(\"error message\")",
  "What: Prefer derived state over an effect that mirrors a prop\nWhy: Effects run a paint late and desync under Strict Mode\nGood: const total = items.length",
  "What: Never widen a public type to `any` to silence tsc\nWhy: It hides the break at the call site instead of the definition\nGood: narrow the input or add an explicit overload",
  "What: Currency amounts must be integer minor units\nWhy: Floats lose cents at scale and the drift is unrecoverable\nGood: amountCents: number",
  "What: Every background job needs a bounded retry\nWhy: Unbounded retries turn one bad payload into an outage\nGood: retry({ attempts: 5, backoff: \"exponential\" })",
  "What: Query params carry view state, not component state\nWhy: A copied URL has to reopen the same screen\nGood: ?status=completed&impact=critical",
] as const;

function buildMemoryRules(): MemoryRule[] {
  const out: MemoryRule[] = [];

  // 26 pattern-backed file rules + 4 written rules = 30, matching `1–10 of 30`.
  for (let i = 0; i < 26; i++) {
    const next = rng(`memfile:${i}`);
    const shape = FILE_RULE_SHAPES[i % FILE_RULE_SHAPES.length];
    const repo = pick(next, REPOS);
    const fileCount = 1 + Math.floor(Math.pow(next(), 2.4) * 42);
    const usageCount = next() < 0.42 ? 0 : Math.floor(next() * 34);
    const upvotes = usageCount === 0 ? 0 : Math.floor(next() * usageCount);
    const downvotes =
      usageCount === 0 ? 0 : Math.floor(next() * (usageCount - upvotes + 1));
    const updatedAt = NOW - Math.floor(1 + next() * 6) * DAY_MS;

    out.push({
      id: `mem_${i + 1}`,
      description: shape.description,
      kind: "file",
      pattern: shape.pattern,
      files: Array.from({ length: Math.min(fileCount, 6) }, (_, f) => ({
        path: f === 0 ? shape.file : `packages/p${f}/${shape.file}`,
        uses: Math.floor(next() * 6),
        repoFullName: repoFullName(repo),
      })),
      repoId: repo.id,
      fileGlob: "",
      status: next() < 0.88 ? "active" : "inactive",
      usageCount,
      usesThisMonth: usageCount === 0 ? 0 : Math.floor(next() * usageCount),
      acceptanceRate: usageCount === 0 ? null : Math.round(next() * 100),
      upvotes,
      downvotes,
      createdAt: updatedAt - 30 * DAY_MS,
      updatedAt,
    });
  }

  for (let i = 0; i < 4; i++) {
    const next = rng(`memrule:${i}`);
    const usageCount = 3 + Math.floor(next() * 40);
    const updatedAt = NOW - Math.floor(1 + next() * 20) * DAY_MS;
    out.push({
      id: `mem_${27 + i}`,
      description: WRITTEN_RULES[i].split("\n")[0].replace(/^What:\s*/, ""),
      kind: "rule",
      pattern: WRITTEN_RULES[i],
      files: [],
      repoId: next() < 0.5 ? null : pick(next, REPOS).id,
      fileGlob: next() < 0.4 ? "src/**/*.tsx" : "",
      status: "active",
      usageCount,
      usesThisMonth: Math.floor(next() * usageCount),
      acceptanceRate: Math.round(next() * 100),
      upvotes: Math.floor(next() * usageCount),
      downvotes: Math.floor(next() * 4),
      createdAt: updatedAt - 45 * DAY_MS,
      updatedAt,
    });
  }

  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export const MEMORY_RULES: MemoryRule[] = buildMemoryRules();

export const REPO_CLUSTERS: RepoCluster[] = [];

export const INTEGRATIONS: Integration[] = [];

export const MEMBERS: Member[] = [
  {
    id: "member_1",
    email: "hi@delavalom.com",
    name: "Luis Angel Arvelo Perez",
    role: "admin",
    avatarSeed: "hi@delavalom.com",
    isYou: true,
  },
];

export const API_KEYS: ApiKey[] = [];

export const ORG_SETTINGS: OrgSettings = {
  autoReviewNewCommits: true,
  reviewDraftPrs: false,
  fileChangeLimit: 100,
  authorFilterMode: "exclude",
  authorFilterTokens: [
    "dependabot[bot]",
    "renovate[bot]",
    "pre-commit-ci[bot]",
    "github-actions[bot]",
    "allcontributors[bot]",
  ],
  updatePrDescription: true,
  summarySections: {
    prSummary: { enabled: true, collapsible: true, defaultOpen: false },
    confidenceScore: { enabled: true, collapsible: true, defaultOpen: false },
    issueTable: { enabled: true, collapsible: true, defaultOpen: false },
    sequenceDiagram: { enabled: true, collapsible: true, defaultOpen: true },
    commentsOutsideDiff: { enabled: true, collapsible: true, defaultOpen: false },
  },
  customInstructions: "",
  strictness: "high",
  commentHeader: "",
  promptToFixWithAi: true,
  useStatusChecks: true,
  requiredConfidence: 0,
  postStatusComments: false,
  autoApprovePrs: false,
  maxAutoApproveRisk: "low",
  trexEnabled: false,
  memoryRuleCreators: "everyone",
  autoEnableNewRepos: false,
  helpImproveGreptile: true,
  featureTips: true,
  orgDisplayName: "Delavalom Labs",
};

export const PERSONAL_SETTINGS: PersonalSettings = {
  name: "Luis Angel Arvelo Perez",
  email: "hi@delavalom.com",
  showAiFixPrompts: false,
  selectedAgents: [],
  reviewSections: {
    summary: { enabled: true, collapsible: false, defaultOpen: false },
    issuesTable: { enabled: true, collapsible: true, defaultOpen: false },
    diagram: { enabled: true, collapsible: true, defaultOpen: true },
    commentsOutsideDiff: { enabled: true, collapsible: true, defaultOpen: false },
  },
  trexOnMyPrs: "default",
  weeklyDigest: true,
  githubLinked: true,
  cursorCloudAgents: "not_configured",
};

/** The 15-day billing window shown on /settings/usage. §8.10 */
export const USAGE_FROM = startOfDay(NOW - DAY_MS);
export const USAGE_TO = startOfDay(ORG.trialEndsAt);
