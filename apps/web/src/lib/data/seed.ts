/**
 * Local-only fixtures.
 *
 * The review data — repositories, pull requests, judgments, findings, members
 * and the organization — now comes from @komodo/store through the server
 * loader, so it is shared rather than per-browser. What is left here is the
 * configuration surface that has no backing table yet and still lives in
 * local state.
 *
 * Everything is derived from a hash-seeded PRNG and the pinned NOW, so the
 * server and the client render byte-identical output.
 */
import { DAY_MS, NOW, pick, rng, startOfDay } from "@/lib/utils";
import type {
  ApiKey,
  Integration,
  MemoryRule,
  OrgSettings,
  PersonalSettings,
  RepoCluster,
} from "@/lib/types";

/**
 * Repository ids as @komodo/store derives them, so a memory rule scoped to a
 * repo points at the same row the queue does.
 */
const REPO_NAMES = [
  "komodo", "gramkit", "railpack", "marketing", "jobs", "market-hq-dbt",
  "ahq", "arvlang", "blender-mcp", "buildolatam", "chatbots-gpt",
  "clone-notion-ai", "7-labs", "7exchange-waitlist", "61149",
] as const;

const REPO_IDS = REPO_NAMES.map((name) => `delavalom/${name}`);

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
    const repoId = pick(next, REPO_IDS);
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
        repoFullName: repoId,
      })),
      repoId,
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
      repoId: next() < 0.5 ? null : pick(next, REPO_IDS),
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
/** The trial's end, pinned rather than read off the organization: the usage
 *  window has to be a module constant, and the org now loads at request time. */
export const USAGE_TO = startOfDay(Date.UTC(2026, 7, 31, 12, 0, 0));
