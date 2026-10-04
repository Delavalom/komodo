# Review Depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Komodo review spend more when a pull request warrants it. Add three depths (standard / deep / thorough) that a person or a routing rule can choose, record how hard each run looked, and derive from the answer ledger whether looking harder found more of what people upheld.

**Architecture:** Depth is resolved in `@komodo/core`'s `runReview`, so it applies the same way to the CLI and the server and works the same across the Claude, Codex and OpenRouter providers. Explicit requests win over rules, and rules win over the default. A deeper run fans out into extra provider passes, each a normal `ReviewProvider.review` call with a pass-specific prompt section. The extra passes' judgements and checks are merged deterministically into the base pass. Each run's depth, reason, pass count and reported cost travel through `ReviewRecord.run` into new `reviews` columns. A requested depth travels through a new `ai_review_jobs.depth` column. Analytics (outcomes by depth and PR size, and credits as passes) are derived at read time from the reviews, judgements and answers already stored.

**Tech Stack:** TypeScript, zod v4, vitest, node:sqlite + Postgres (PGlite in tests), Next.js app router (apps/web), commander (CLI), picomatch.

---

## Ground rules for whoever executes this

Read `AGENTS.md` at the repo root first. The rules this plan touches:

- **Rule 1:** every port change is implemented in **both** `packages/store/src/sqlite.ts` and `packages/store/src/postgres.ts` and covered in `packages/store/test/conformance.ts`, in the same commit.
- **Rule 3:** a settings field without a control, or a control without a field, is the bug `packages/ingest/src/settings.ts` exists to prevent. Tasks 12 and 17 add both halves.
- **Rule 4:** no counter columns. "Upheld", "credits" and every analytics number are derived at read time.
- **Rule 5:** the seeder writes real runs through the port, seeded from `rng(...)`.
- **Rule 7:** no `useEffect`.
- **Rule 10:** the verification bar is `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm -r test`, **and** the changed routes opened against a real store (Task 21).
- **Rule 14:** UI copy is ours. Don't name another product, and don't show numbers nobody measured.
- **Rule 15:** depth buys a better brief for the human (architecture, scope, tests, verification checks), not a merge decision. No copy may imply a deeper review means a PR is safe.

**Workspace packages resolve to `dist`.** `@komodo/core` and `@komodo/store` export `./dist/*`, so `ingest`, `cli` and `apps/web` see a core or store change only after a rebuild. Before running tests or typecheck in a downstream package, run:

```bash
pnpm --filter @komodo/diagram --filter @komodo/core --filter @komodo/store build
```

Each task below that crosses a package boundary repeats this.

Commits end with:

```
Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
```

### Setup (once)

```bash
cd /Users/delavalom/delavalom-labs/komodo
git fetch origin
git worktree add ../komodo-review-depth -b feat/review-depth origin/main
cd ../komodo-review-depth
pnpm install
pnpm -r test   # baseline: must be green before you start
```

### Decisions locked by this plan

| Decision | Choice | Why |
|---|---|---|
| Depth names | `standard`, `deep`, `thorough` | Ours, and they describe effort rather than rank. |
| Passes per depth | standard 1, deep 2 (base + second look), thorough 5 (base + architecture/scope/tests lenses in parallel + second look) | The two extra-pass kinds cover what a single pass misses: one dimension at a time, and what nobody looked for. |
| Credits | One credit = one model pass that returned a result | Measured, not invented. A failed optional pass costs no credit. |
| Merge | Deterministic (same path + same focus + within 3 lines, or same normalised title for cross-cutting); keep the more severe; checks deduped by normalised title, `required` ORed | Testable, and costs no extra pass. |
| Extra pass fails | Run continues; `passes` records what actually returned | A failed lens is not worth failing the review. The UI then shows "4 of 5 passes". |
| Base pass fails | Run fails exactly as today | Nothing to merge into. |
| Rule shape | One condition per rule: `files`, `lines`, `path` or `label` | One row in the UI equals one rule in YAML, with no hidden AND. |
| Rule precedence | Explicit request > deepest matching rule > default; rules never lower below default | A person asking is the strongest signal. |
| What rules count | Files and lines **after** path filters | The set the reviewer actually reads; lockfile churn doesn't escalate. |
| `max_files` cap | **Unchanged.** Still skips a PR, explicit or not | It answers "can this be reviewed at all", a separate question from depth. Revisit after Task 19's numbers exist. |
| Interactive path (`claim`/`submit`) | **Out of scope.** Those runs are recorded as standard with no reason | Komodo can't measure how many passes a person's own agent made, and recording a number it didn't observe breaks rule 4's spirit. Follow-up below. |
| Analytics size bands | 1–10, 11–27, 28+ changed files (the PR's `changedFiles`) | Fixed bands; the seeded dataset can populate them. |

### Out of scope (follow-ups, not part of this plan)

1. **Depth for interactive claims.** `RemoteClaim` and `InteractiveClaimFile` would carry `depth`, the plugin skill would run the extra passes as subagents, and `submit` would record them as self-reported. That needs a plugin version bump (see `RELEASING.md`).
2. Showing the requested depth on the queue's "Queued" pill.
3. Changing the `max_files` cap into a downgrade instead of a skip.

---

## File structure

**Create**

| File | Responsibility |
|---|---|
| `packages/core/src/depth.ts` | Depth vocabulary: names, rank, passes, turn budgets, labels. No imports, so it's safe anywhere. |
| `packages/core/src/depth-rules.ts` | `resolveDepth`: explicit request vs rules vs default, with a human-readable reason. |
| `packages/core/src/merge.ts` | `mergeResults` and `sameConcern`: deterministic merge of extra passes into the base pass. |
| `packages/core/src/passes.ts` | `runPasses`: runs 1, 2 or 5 provider passes for a depth and sums the passes and reported cost. |
| `packages/core/src/eval.ts` | `EvalFileSchema` and `scoreCase`: score a review result against expected findings. |
| `packages/core/test/depth.test.ts` | Config schema and `resolveDepth`. |
| `packages/core/test/merge.test.ts` | `mergeResults`. |
| `packages/core/test/passes.test.ts` | `runPasses` with a fake provider. |
| `packages/core/test/claude-provider.test.ts` | Claude provider honours `turnBudget` and reports cost (SDK mocked). |
| `packages/core/test/pipeline-depth.test.ts` | `runReview` resolves depth, fans out and records `run`. |
| `packages/core/test/eval.test.ts` | `scoreCase`. |
| `packages/store/src/depth.ts` | Client-safe depth vocabulary mirror, size bands, `summarizeDepthOutcomes`, `describeDepth`. |
| `packages/store/test/depth.test.ts` | The pure helpers above. |
| `packages/store/test/depth-migration.test.ts` | Migration 016 on both dialects. |
| `packages/cli/src/commands/eval.ts` | `komodo-review eval <file>`. |
| `eval/playground.yaml` | Fixture: the three seeded bugs in `Delavalom/komodo-playground#1`. |
| `apps/web/src/components/review/request-review-button.tsx` | "Review with AI" plus a depth menu. |
| `apps/web/src/components/settings/review-depth-section.tsx` | Settings: default depth and rules editor. |
| `docs/architecture/review-depth.md` | Why depth exists and how it flows. |

**Modify**

| File | Change |
|---|---|
| `packages/core/src/config.ts` | `DepthRuleSchema`; `depth` block on `KomodoConfigSchema`. |
| `packages/core/src/schema.ts` | Optional `run` on `ReviewRecordSchema`. |
| `packages/core/src/providers/types.ts` | `ReviewPass`, `LensFocus`, `PassUsage`; `pass` / `turnBudget` / `onUsage` on `ReviewInput`. |
| `packages/core/src/providers/prompt.ts` | `passSection`, inserted into the prompt. |
| `packages/core/src/providers/claude.ts` | `maxTurns` from `turnBudget`; report `total_cost_usd`. |
| `packages/core/src/providers/openrouter.ts` | `complete` returns usage; `review` reports cost. |
| `packages/core/src/pipeline.ts` | `depthRequest` option; resolve depth; `runPasses`; `record.run`. |
| `packages/core/src/index.ts` | Export the new modules. |
| `packages/store/src/types.ts` | `ReviewDepth`, `DepthRuleSetting`, `ReviewRunOutcome`; fields on `AIReviewJob`, `Review`, `OrgSettings`. |
| `packages/store/src/port.ts` | `depth` on `requestAIReview`; run fields on `ReviewInput`; `reviewRuns` on `QueueSnapshot`. |
| `packages/store/src/migrate.ts` | Migration `016-review-depth`. |
| `packages/store/src/sqlite.ts` / `postgres.ts` | Base DDL, `requestAIReview`, `saveReview`, row mappers, `readReviewRuns`, snapshot. |
| `packages/store/src/settings.ts` | Defaults for `reviewDepth` and `depthRules`. |
| `packages/store/src/seed.ts` | Seeded runs carry a depth; wider `changedFiles` spread. |
| `packages/store/src/index.ts` | Export the new types and helpers. |
| `packages/store/test/conformance.ts` | Depth on jobs, run fields on reviews, `reviewRuns`. |
| `packages/ingest/src/settings.ts` | `reviewDepth` / `depthRules` ↔ `config.depth`. |
| `packages/ingest/src/map.ts` | `toReview` carries `record.run`. |
| `packages/ingest/src/review.ts` | The job's requested depth reaches `runReview`. |
| `packages/ingest/test/settings.test.ts`, `map.test.ts`, `review.test.ts` | Coverage. |
| `packages/cli/src/index.ts`, `commands/pr.ts` | `--depth`; the `eval` command. |
| `apps/web/src/lib/data/actions.ts` | `requestAIReview(prId, headSha, depth?)`. |
| `apps/web/src/lib/data/queries.ts` | `useDepthOutcomes`, `useUsageCost`; `useUsageDays` counts passes from runs. |
| `apps/web/src/lib/types.ts` | Re-export the new store types. |
| `apps/web/src/components/queue/view.tsx`, `review/header.tsx` | Use `RequestReviewButton`. |
| `apps/web/src/components/settings/review-view.tsx`, `sidebar.tsx` | Mount the depth section and link it. |
| `apps/web/src/components/review/whole.tsx` | Run footer shows depth, passes, reason and cost. |
| `apps/web/src/components/analytics/view.tsx` | "What deeper reviews found" panel. |
| `apps/web/src/components/settings/usage-view.tsx` | Credits = passes; per-developer credits; reported cost. |
| `komodo.yaml`, `packages/cli/komodo.yaml` | Commented `depth:` example. |

---

## Task 1: Depth vocabulary and config schema (core)

**Files:**
- Create: `packages/core/src/depth.ts`
- Modify: `packages/core/src/config.ts` (imports at top; insert after the `min_severity` line, currently line 90)
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/depth.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/depth.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { KomodoConfigSchema } from "../src/config.js";
import { DEPTH_PASSES, DEPTH_RANK, REVIEW_DEPTHS } from "../src/depth.js";

describe("depth vocabulary", () => {
  it("orders the depths from cheapest to deepest", () => {
    expect([...REVIEW_DEPTHS]).toEqual(["standard", "deep", "thorough"]);
    expect(DEPTH_RANK.standard).toBeLessThan(DEPTH_RANK.deep);
    expect(DEPTH_RANK.deep).toBeLessThan(DEPTH_RANK.thorough);
  });

  it("spends one pass on a standard review", () => {
    expect(DEPTH_PASSES).toEqual({ standard: 1, deep: 2, thorough: 5 });
  });
});

describe("depth config", () => {
  it("defaults to standard with no rules", () => {
    expect(KomodoConfigSchema.parse({}).depth).toEqual({ default: "standard", rules: [] });
  });

  it("accepts one condition per rule", () => {
    const config = KomodoConfigSchema.parse({
      depth: {
        default: "deep",
        rules: [
          { files: 28, depth: "thorough" },
          { lines: 800, depth: "thorough" },
          { path: "migrations/**", depth: "deep" },
          { label: "needs-deep-review", depth: "thorough" },
        ],
      },
    });
    expect(config.depth.default).toBe("deep");
    expect(config.depth.rules).toHaveLength(4);
  });

  it("refuses a rule with no condition", () => {
    expect(() =>
      KomodoConfigSchema.parse({ depth: { rules: [{ depth: "deep" }] } }),
    ).toThrow(/exactly one condition/);
  });

  it("refuses a rule with two conditions, which would read as an AND nobody wrote", () => {
    expect(() =>
      KomodoConfigSchema.parse({
        depth: { rules: [{ files: 10, label: "big", depth: "deep" }] },
      }),
    ).toThrow(/exactly one condition/);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm -C packages/core exec vitest run test/depth.test.ts`
Expected: FAIL with `Cannot find module '../src/depth.js'`.

- [ ] **Step 3: Create `packages/core/src/depth.ts`**

```ts
/**
 * How much a review spends.
 *
 * A standard review is one pass over the diff and the code it touches. Deep
 * adds a second look aimed at what the first pass did not raise. Thorough
 * gives architecture, scope and tests a pass each, in parallel, and then the
 * second look. More passes buy a better brief for the person reviewing — more
 * of the decisions they have to make, and more of the results they have to
 * observe. They never buy a merge decision; see AGENTS.md rule 15.
 *
 * No imports, on purpose: this is vocabulary, and anything may need it.
 */
export const REVIEW_DEPTHS = ["standard", "deep", "thorough"] as const;
export type ReviewDepth = (typeof REVIEW_DEPTHS)[number];

export const DEPTH_RANK: Record<ReviewDepth, number> = {
  standard: 0,
  deep: 1,
  thorough: 2,
};

/**
 * Passes a run at this depth makes when every pass returns.
 *
 * One pass is one credit, and this table is what the settings screen and the
 * review button show next to each depth. A run that lost an optional pass
 * records fewer — see `runPasses`.
 */
export const DEPTH_PASSES: Record<ReviewDepth, number> = {
  standard: 1,
  deep: 2,
  thorough: 5,
};

/**
 * Agent turns each pass may take, for providers that run an agent loop.
 *
 * Standard keeps the 40 the Claude provider always used. A deeper pass is
 * asked to trace further — callers, configuration, tests outside the diff —
 * and that takes turns.
 */
export const DEPTH_TURNS: Record<ReviewDepth, number> = {
  standard: 40,
  deep: 60,
  thorough: 80,
};

export const DEPTH_LABEL: Record<ReviewDepth, string> = {
  standard: "Standard",
  deep: "Deep",
  thorough: "Thorough",
};
```

- [ ] **Step 4: Add the schema to `packages/core/src/config.ts`**

Add to the imports at the top, after `import { SEVERITIES } from "./schema.js";`:

```ts
import { REVIEW_DEPTHS } from "./depth.js";
```

Add this block above `export const KomodoConfigSchema = z.object({`:

```ts
/**
 * One reason to spend more on a review.
 *
 * Exactly one condition per rule. Two conditions on one rule would have to
 * mean AND or OR, and whichever this file picked, the settings screen — one
 * row, one condition — could not show it. Several rules are how a team says
 * OR; the deepest matching rule wins.
 */
export const DepthRuleSchema = z
  .object({
    depth: z.enum(REVIEW_DEPTHS),
    /** Matches when at least this many reviewable files changed. */
    files: z.number().int().min(1).optional(),
    /** Matches when at least this many reviewable lines changed (added + deleted). */
    lines: z.number().int().min(1).optional(),
    /** Matches when any reviewable file matches this glob. */
    path: z.string().min(1).optional(),
    /** Matches when the pull request carries this label, case-insensitively. */
    label: z.string().min(1).optional(),
  })
  .refine(
    (rule) =>
      [rule.files, rule.lines, rule.path, rule.label].filter((v) => v !== undefined)
        .length === 1,
    { message: "A depth rule names exactly one condition: files, lines, path or label." },
  );
export type DepthRule = z.infer<typeof DepthRuleSchema>;
```

Inside `KomodoConfigSchema`, directly after `min_severity: z.enum(SEVERITIES).default("minor"),`, add:

```ts
  /**
   * How hard a review looks — see ./depth.ts.
   *
   * `default` is what every review gets. `rules` raise it for the pull
   * requests that warrant more: a large change, a sensitive path, a label
   * someone applied. A person who picks a depth from the Review with AI menu
   * overrides both for that one run. Settings → Review owns these once the
   * store has adopted this file.
   */
  depth: z
    .object({
      default: z.enum(REVIEW_DEPTHS).default("standard"),
      rules: z.array(DepthRuleSchema).default([]),
    })
    .prefault({}),
```

- [ ] **Step 5: Export from `packages/core/src/index.ts`**

Add after `export * from "./config.js";`:

```ts
export * from "./depth.js";
```

- [ ] **Step 6: Run the test and confirm it passes**

Run: `pnpm -C packages/core exec vitest run test/depth.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 7: Typecheck and commit**

```bash
pnpm -C packages/core typecheck
git add packages/core/src/depth.ts packages/core/src/config.ts packages/core/src/index.ts packages/core/test/depth.test.ts
git commit -m "feat(core): review depth vocabulary and komodo.yaml depth rules

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `resolveDepth` (core)

**Files:**
- Create: `packages/core/src/depth-rules.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/depth.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Add `import { resolveDepth } from "../src/depth-rules.js";` to the imports at the top of `packages/core/test/depth.test.ts`, then append:

```ts
const files = (n: number, lines = 10, prefix = "src/f") =>
  Array.from({ length: n }, (_, i) => ({
    path: `${prefix}${i}.ts`,
    additions: lines,
    deletions: 0,
  }));

const withRules = (rules: unknown[], fallback = "standard") =>
  KomodoConfigSchema.parse({ depth: { default: fallback, rules } });

describe("resolveDepth", () => {
  it("uses the deployment default when nothing matches", () => {
    expect(resolveDepth(withRules([]), { files: files(3), labels: [] })).toEqual({
      depth: "standard",
      reason: "deployment default",
    });
  });

  it("raises the depth on a file-count rule and says why", () => {
    const decision = resolveDepth(withRules([{ files: 28, depth: "thorough" }]), {
      files: files(31),
      labels: [],
    });
    expect(decision).toEqual({
      depth: "thorough",
      reason: "31 files changed (rule: at least 28)",
    });
  });

  it("counts added and deleted lines for a line rule", () => {
    const decision = resolveDepth(withRules([{ lines: 100, depth: "deep" }]), {
      files: [{ path: "a.ts", additions: 70, deletions: 40 }],
      labels: [],
    });
    expect(decision).toEqual({ depth: "deep", reason: "110 lines changed (rule: at least 100)" });
  });

  it("matches a path glob, dotfiles included", () => {
    const decision = resolveDepth(withRules([{ path: "**/migrations/**", depth: "deep" }]), {
      files: [{ path: "db/migrations/001.sql", additions: 1, deletions: 0 }],
      labels: [],
    });
    expect(decision).toEqual({
      depth: "deep",
      reason: "touches db/migrations/001.sql (rule: **/migrations/**)",
    });
  });

  it("matches a label regardless of case", () => {
    const decision = resolveDepth(withRules([{ label: "Needs-Deep-Review", depth: "thorough" }]), {
      files: files(1),
      labels: ["needs-deep-review"],
    });
    expect(decision).toEqual({ depth: "thorough", reason: "labelled needs-deep-review" });
  });

  it("takes the deepest matching rule whatever order the rules are in", () => {
    const decision = resolveDepth(
      withRules([
        { files: 2, depth: "deep" },
        { label: "risky", depth: "thorough" },
      ]),
      { files: files(5), labels: ["risky"] },
    );
    expect(decision.depth).toBe("thorough");
  });

  it("never lowers a review below the default", () => {
    const decision = resolveDepth(withRules([{ files: 1, depth: "standard" }], "deep"), {
      files: files(5),
      labels: [],
    });
    expect(decision).toEqual({ depth: "deep", reason: "deployment default" });
  });

  it("lets a person's request override the rules, in either direction", () => {
    const config = withRules([{ files: 1, depth: "thorough" }]);
    expect(
      resolveDepth(config, { files: files(5), labels: [] }, { depth: "standard", by: "renata" }),
    ).toEqual({ depth: "standard", reason: "requested by renata" });
    expect(
      resolveDepth(config, { files: files(5), labels: [] }, { depth: "deep" }),
    ).toEqual({ depth: "deep", reason: "requested" });
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm -C packages/core exec vitest run test/depth.test.ts`
Expected: FAIL with `Cannot find module '../src/depth-rules.js'`.

- [ ] **Step 3: Create `packages/core/src/depth-rules.ts`**

```ts
import picomatch from "picomatch";

import type { DepthRule, KomodoConfig } from "./config.js";
import { DEPTH_RANK, type ReviewDepth } from "./depth.js";

/** What a run decided, and the sentence the review page shows for it. */
export interface DepthDecision {
  depth: ReviewDepth;
  reason: string;
}

/** The facts a rule can test. Files are the reviewable set, after path filters. */
export interface DepthSubject {
  files: { path: string; additions: number; deletions: number }[];
  labels: string[];
}

/** A depth a person picked for one run. */
export interface DepthRequest {
  depth: ReviewDepth;
  /** Who asked, for the reason line. Null when the caller has no actor. */
  by?: string | null;
}

/**
 * Which depth this run gets.
 *
 * A request wins outright, in either direction: someone asking for a standard
 * pass on a pull request the rules would make thorough has a reason, and
 * Komodo second-guessing them would be a menu that does nothing. Otherwise
 * the deepest matching rule wins, and no rule can take a review below the
 * default — a rule is a reason to spend more, never less.
 */
export function resolveDepth(
  config: Pick<KomodoConfig, "depth">,
  subject: DepthSubject,
  request?: DepthRequest | null,
): DepthDecision {
  if (request) {
    return {
      depth: request.depth,
      reason: request.by ? `requested by ${request.by}` : "requested",
    };
  }

  let best: DepthDecision = { depth: config.depth.default, reason: "deployment default" };
  for (const rule of config.depth.rules) {
    // Strictly deeper only: the first rule to reach a depth keeps the reason.
    if (DEPTH_RANK[rule.depth] <= DEPTH_RANK[best.depth]) continue;
    const why = matchRule(rule, subject);
    if (why) best = { depth: rule.depth, reason: why };
  }
  return best;
}

function matchRule(rule: DepthRule, subject: DepthSubject): string | null {
  if (rule.files !== undefined) {
    const n = subject.files.length;
    return n >= rule.files ? `${n} files changed (rule: at least ${rule.files})` : null;
  }
  if (rule.lines !== undefined) {
    const n = subject.files.reduce((sum, f) => sum + f.additions + f.deletions, 0);
    return n >= rule.lines ? `${n} lines changed (rule: at least ${rule.lines})` : null;
  }
  if (rule.path !== undefined) {
    const isMatch = picomatch(rule.path, { dot: true });
    const hit = subject.files.find((f) => isMatch(f.path));
    return hit ? `touches ${hit.path} (rule: ${rule.path})` : null;
  }
  if (rule.label !== undefined) {
    const wanted = rule.label.toLowerCase();
    const hit = subject.labels.find((l) => l.toLowerCase() === wanted);
    return hit ? `labelled ${hit}` : null;
  }
  return null;
}
```

- [ ] **Step 4: Export it**

In `packages/core/src/index.ts`, after `export * from "./depth.js";`:

```ts
export * from "./depth-rules.js";
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `pnpm -C packages/core exec vitest run test/depth.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/depth-rules.ts packages/core/src/index.ts packages/core/test/depth.test.ts
git commit -m "feat(core): resolve a review's depth from requests, rules and the default

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Deterministic merge (core)

**Files:**
- Create: `packages/core/src/merge.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/merge.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/merge.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { mergeResults, sameConcern } from "../src/merge.js";
import type { Judgement, ReviewResult, VerificationCheck } from "../src/schema.js";

const judgement = (over: Partial<Judgement> = {}): Judgement => ({
  path: "src/wallet.js",
  line: 12,
  severity: "major",
  kind: "Risk",
  focus: "code",
  tag: "changes how balances move",
  title: "Two credits can read the same balance.",
  lede: "Both writes land and one is lost.",
  detail: "A lock or an atomic update avoids it.",
  ask: "Can two credits for one user run at once?",
  sources: ["the diff"],
  sourceNote: "The diff awaits between the read and the write.",
  code: "src/wallet.js:12 const current = getBalance(userId)",
  options: [
    { label: "Yes — serialise them", bucket: "Blocks" },
    { label: "No — one at a time already", bucket: "Agreed" },
    { label: "I have a question first", bucket: "Asked" },
    { label: "Not my call", bucket: "Passed on" },
  ],
  fixPrompt: "Make credit atomic.",
  ...over,
});

const check = (over: Partial<VerificationCheck> = {}): VerificationCheck => ({
  title: "Two concurrent transfers leave the right balances.",
  instruction: "Run two transfers at once against the dev store.",
  expectedResult: "Both balances add up.",
  evidenceKinds: ["test_run"],
  required: false,
  ...over,
});

const result = (over: Partial<ReviewResult> = {}): ReviewResult => ({
  summary: "- Adds async wallet operations",
  walkthrough: [{ files: ["src/wallet.js"], summary: "Credit and transfer go async." }],
  confidence: 3,
  verdict: "Read the wallet changes against the tests.",
  effort: 2,
  verificationChecks: [],
  judgements: [],
  ...over,
});

describe("sameConcern", () => {
  it("treats the same focus on nearby lines of one file as one concern", () => {
    expect(sameConcern(judgement({ line: 12 }), judgement({ line: 15 }))).toBe(true);
    expect(sameConcern(judgement({ line: 12 }), judgement({ line: 16 }))).toBe(false);
  });

  it("keeps a different focus on the same line apart", () => {
    expect(sameConcern(judgement(), judgement({ focus: "tests" }))).toBe(false);
  });

  it("matches cross-cutting judgements by title, ignoring case and punctuation", () => {
    const a = judgement({ path: "", line: 0, focus: "scope", title: "This PR also rewrites the logger." });
    const b = judgement({ path: "", line: 0, focus: "scope", title: "this pr also rewrites the LOGGER" });
    expect(sameConcern(a, b)).toBe(true);
  });
});

describe("mergeResults", () => {
  it("keeps the base pass's summary, walkthrough and scores", () => {
    const base = result();
    const merged = mergeResults(base, [result({ summary: "- one line", confidence: 1 })]);
    expect(merged.summary).toBe(base.summary);
    expect(merged.walkthrough).toEqual(base.walkthrough);
    expect(merged.confidence).toBe(3);
  });

  it("adds what the extra passes found and drops their repeats", () => {
    const base = result({ judgements: [judgement()] });
    const extra = result({
      judgements: [
        judgement({ line: 13 }),
        judgement({ focus: "tests", line: 0, path: "", title: "Nothing tests a concurrent transfer." }),
      ],
    });
    const merged = mergeResults(base, [extra]);
    expect(merged.judgements).toHaveLength(2);
    expect(merged.judgements[1].focus).toBe("tests");
  });

  it("keeps the more severe of two judgements on the same concern", () => {
    const base = result({ judgements: [judgement({ severity: "minor" })] });
    const merged = mergeResults(base, [result({ judgements: [judgement({ severity: "critical" })] })]);
    expect(merged.judgements).toHaveLength(1);
    expect(merged.judgements[0].severity).toBe("critical");
  });

  it("dedupes checks by title and keeps one required if either was", () => {
    const base = result({ verificationChecks: [check()] });
    const merged = mergeResults(base, [
      result({ verificationChecks: [check({ title: "Two concurrent transfers leave the right balances", required: true })] }),
    ]);
    expect(merged.verificationChecks).toHaveLength(1);
    expect(merged.verificationChecks[0].required).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm -C packages/core exec vitest run test/merge.test.ts`
Expected: FAIL with `Cannot find module '../src/merge.js'`.

- [ ] **Step 3: Create `packages/core/src/merge.ts`**

```ts
import {
  SEVERITY_RANK,
  type Judgement,
  type ReviewResult,
  type VerificationCheck,
} from "./schema.js";

/** How many lines apart two judgements can sit and still be one concern. */
const SAME_SPOT = 3;

/**
 * Whether two judgements are the same concern raised twice.
 *
 * Same focus and same file within a few lines, or — for a cross-cutting
 * judgement, which has no line to compare — the same title once case and
 * punctuation are set aside. Deliberately narrow: two passes that disagree
 * about what a line does have both said something worth reading, and merging
 * them would silently lose one.
 */
export function sameConcern(a: Judgement, b: Judgement): boolean {
  if (a.focus !== b.focus || a.path !== b.path) return false;
  if (!a.path) return normalize(a.title) === normalize(b.title);
  return Math.abs(a.line - b.line) <= SAME_SPOT;
}

/**
 * Folds extra passes into the base pass.
 *
 * The base pass owns everything that describes the change as a whole — the
 * summary, the walkthrough, the confidence and effort, the diagram — because
 * it is the only pass asked to write them properly. The extra passes
 * contribute judgements and verification checks, and nothing else. Where two
 * passes raised the same concern, the more severe reading stays.
 */
export function mergeResults(base: ReviewResult, extras: ReviewResult[]): ReviewResult {
  const judgements = [...base.judgements];
  for (const candidate of extras.flatMap((r) => r.judgements)) {
    const at = judgements.findIndex((j) => sameConcern(j, candidate));
    if (at === -1) judgements.push(candidate);
    else if (SEVERITY_RANK[candidate.severity] > SEVERITY_RANK[judgements[at].severity]) {
      judgements[at] = candidate;
    }
  }

  const checks: VerificationCheck[] = [...base.verificationChecks];
  for (const candidate of extras.flatMap((r) => r.verificationChecks)) {
    const at = checks.findIndex((c) => normalize(c.title) === normalize(candidate.title));
    if (at === -1) checks.push(candidate);
    else if (candidate.required && !checks[at].required) {
      checks[at] = { ...checks[at], required: true };
    }
  }

  return { ...base, judgements, verificationChecks: checks };
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
```

- [ ] **Step 4: Export it**

In `packages/core/src/index.ts`, after `export * from "./depth-rules.js";`:

```ts
export * from "./merge.js";
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `pnpm -C packages/core exec vitest run test/merge.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/merge.ts packages/core/src/index.ts packages/core/test/merge.test.ts
git commit -m "feat(core): merge extra review passes into the base pass deterministically

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Pass-aware prompt (core)

**Files:**
- Modify: `packages/core/src/providers/types.ts`
- Modify: `packages/core/src/providers/prompt.ts`
- Modify: `packages/core/src/providers/index.ts` (type exports)
- Test: `packages/core/test/prompt.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/test/prompt.test.ts`. The file already defines `pr` and `files`. Also import `Judgement` if it isn't already, though it is:

```ts
describe("buildReviewPrompt — passes", () => {
  const config = KomodoConfigSchema.parse({});

  it("adds nothing for a standard single pass", () => {
    expect(buildReviewPrompt({ pr, files, config })).not.toContain("## This pass");
    expect(buildReviewPrompt({ pr, files, config, pass: { kind: "base" } })).not.toContain(
      "## This pass",
    );
  });

  it("narrows a lens pass to its one question", () => {
    const prompt = buildReviewPrompt({ pr, files, config, pass: { kind: "lens", focus: "tests" } });
    expect(prompt).toContain("## This pass");
    expect(prompt).toContain("Only judgements with focus `tests`");
  });

  it("hands a second look what was already raised, and tells it not to repeat it", () => {
    const prior = [
      {
        path: "src/settings.tsx",
        line: 1,
        focus: "code",
        title: "The new value is never saved.",
      },
    ] as unknown as Judgement[];
    const prompt = buildReviewPrompt({
      pr,
      files,
      config,
      pass: { kind: "second-look", prior },
    });
    expect(prompt).toContain("Do not repeat them");
    expect(prompt).toContain("- [code] src/settings.tsx:1 — The new value is never saved.");
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm -C packages/core exec vitest run test/prompt.test.ts`
Expected: FAIL, with a TypeScript/vitest error that `pass` is not a known property, or an assertion failure on `## This pass`.

- [ ] **Step 3: Extend `packages/core/src/providers/types.ts`**

Change the schema import line to:

```ts
import type { Judgement, ReviewResult } from "../schema.js";
```

Add above `export interface ReviewInput {`:

```ts
/** The three dimensions a thorough review gives a pass of their own. */
export type LensFocus = "architecture" | "scope" | "tests";

/**
 * Which pass of a review this is.
 *
 * `base` is the ordinary review, and the only pass asked for the summary,
 * walkthrough and scores. `lens` asks one question across the whole change.
 * `second-look` is handed everything already raised and asked only for what
 * is missing. See `runPasses` in ../passes.ts.
 */
export type ReviewPass =
  | { kind: "base" }
  | { kind: "lens"; focus: LensFocus }
  | { kind: "second-look"; prior: Judgement[] };

/** What a provider reports about a pass it just ran. */
export interface PassUsage {
  /** In USD, as the provider stated it. Absent when it states nothing. */
  costUsd?: number;
}
```

Add these fields at the end of `ReviewInput`, after `sharedContext?`:

```ts
  /** Which pass this is. Absent means a standard single pass. */
  pass?: ReviewPass;
  /** Agent turns this pass may take, for providers that run an agent loop. */
  turnBudget?: number;
  /** Called with what the pass cost, when the provider reports it. */
  onUsage?: (usage: PassUsage) => void;
```

In `packages/core/src/providers/index.ts`, change the last type export line to:

```ts
export type {
  LensFocus,
  PassUsage,
  ReviewInput,
  ReviewMemory,
  ReviewPass,
  ReviewProvider,
} from "./types.js";
```

- [ ] **Step 4: Add `passSection` to `packages/core/src/providers/prompt.ts`**

Change the types import to:

```ts
import type { LensFocus, ReviewInput, ReviewPass } from "./types.js";
```

Add above `export function buildReviewPrompt`:

```ts
const LENS_BRIEF: Record<LensFocus, string> = {
  architecture:
    "ownership, layering, system boundaries and data flow. Trace the callers of every changed export and the modules that own the data it touches. Read the configuration and generated files the change depends on, even when they are outside the diff.",
  scope:
    "whether the change reaches farther than its task: unrelated files, a new dependency or module where an existing one would do, and behaviour that changes without the description mentioning it.",
  tests:
    "whether the tests prove the change. Find the tests that exercise each changed path, name the paths none of them reach, and look for behaviour that only appears under particular configuration, limits or input sizes.",
};

/**
 * The section that tells one pass of a multi-pass review what it is for.
 *
 * Empty for the base pass, which is exactly the review Komodo always ran — so
 * a standard review's prompt is unchanged byte for byte.
 */
export function passSection(pass: ReviewPass | undefined): string {
  if (!pass || pass.kind === "base") return "";

  const keep =
    "Only new judgements and verification checks are kept from this pass. Write the summary and walkthrough as one line each. An empty judgement list is a valid answer.";

  if (pass.kind === "lens") {
    return `\n## This pass\nThis is one of several passes over the same pull request, and its whole job is one question: ${LENS_BRIEF[pass.focus]}\nOnly judgements with focus \`${pass.focus}\` are kept from this pass. ${keep}\n`;
  }

  const prior = pass.prior.length
    ? pass.prior
        .map((j) => `- [${j.focus}] ${j.path || "(cross-cutting)"}:${j.line} — ${j.title}`)
        .join("\n")
    : "- (none)";
  return `\n## This pass\nEarlier passes over this pull request already raised the judgements below. Do not repeat them, reword them or argue with them. Look for what they missed — most often behaviour that only appears under particular configuration, limits or input sizes, a changed path no test reaches, and files the change depends on outside the diff. ${keep}\n\nAlready raised:\n${prior}\n`;
}
```

In `buildReviewPrompt`'s returned template, replace the line

```
${profileNote}
```

with

```
${profileNote}
${passSection(input.pass)}
```

- [ ] **Step 5: Run the prompt tests and confirm they pass**

Run: `pnpm -C packages/core exec vitest run test/prompt.test.ts`
Expected: PASS. Every pre-existing prompt test must also pass, because the base pass adds only an empty string.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/providers/types.ts packages/core/src/providers/prompt.ts packages/core/src/providers/index.ts packages/core/test/prompt.test.ts
git commit -m "feat(core): give lens and second-look passes their own prompt section

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Providers honour the turn budget and report cost (core)

**Files:**
- Modify: `packages/core/src/providers/claude.ts:42` (the `maxTurns` line) and the `m.type === "result"` block
- Modify: `packages/core/src/providers/openrouter.ts`
- Test: `packages/core/test/claude-provider.test.ts`

Codex reports no cost through `codex exec`, and it has no turn limit to set, so `codex.ts` doesn't change. Its runs record `costUsd: null`.

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/claude-provider.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  calls: [] as Array<{ options: Record<string, unknown> }>,
  cost: 0.42 as number | undefined,
}));

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: (args: { options: Record<string, unknown> }) => {
    sdk.calls.push(args);
    return (async function* () {
      yield {
        type: "result",
        subtype: "success",
        total_cost_usd: sdk.cost,
        structured_output: {
          summary: "- Adds a limiter",
          walkthrough: [],
          confidence: 3,
          verdict: "Read the limiter.",
          effort: 1,
          verificationChecks: [],
          judgements: [],
        },
      };
    })();
  },
}));

import { KomodoConfigSchema } from "../src/config.js";
import { ClaudeProvider } from "../src/providers/claude.js";

const input = {
  pr: {
    owner: "acme", repo: "api", number: 1, title: "Limits", body: "", author: "dev",
    url: "https://github.com/acme/api/pull/1", baseRef: "main", headRef: "limits",
    headSha: "abc", isDraft: false, labels: [],
  },
  files: [],
  config: KomodoConfigSchema.parse({}),
};

describe("ClaudeProvider", () => {
  beforeEach(() => {
    sdk.calls.length = 0;
    sdk.cost = 0.42;
  });

  it("keeps the forty-turn budget a standard review always had", async () => {
    await new ClaudeProvider().review(input);
    expect(sdk.calls[0].options.maxTurns).toBe(40);
  });

  it("gives a deeper pass the budget it was handed", async () => {
    await new ClaudeProvider().review({ ...input, turnBudget: 80 });
    expect(sdk.calls[0].options.maxTurns).toBe(80);
  });

  it("reports the cost the SDK states", async () => {
    const usage: unknown[] = [];
    await new ClaudeProvider().review({ ...input, onUsage: (u) => usage.push(u) });
    expect(usage).toEqual([{ costUsd: 0.42 }]);
  });

  it("reports nothing when the SDK states nothing", async () => {
    sdk.cost = undefined;
    const usage: unknown[] = [];
    await new ClaudeProvider().review({ ...input, onUsage: (u) => usage.push(u) });
    expect(usage).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm -C packages/core exec vitest run test/claude-provider.test.ts`
Expected: FAIL. `maxTurns` is 40 where 80 is expected, and `usage` is `[]` where one entry is expected.

- [ ] **Step 3: Change `packages/core/src/providers/claude.ts`**

Replace `maxTurns: 40,` with:

```ts
        maxTurns: input.turnBudget ?? 40,
```

Inside `if (m.type === "result") {`, directly after the `if (m.subtype && m.subtype !== "success") { ... }` block, add:

```ts
        // The SDK states a cost on every successful result. On a subscription
        // it is what the run would have cost on the API, which is still the
        // honest number to compare depths by.
        if (typeof m.total_cost_usd === "number") {
          input.onUsage?.({ costUsd: m.total_cost_usd });
        }
```

- [ ] **Step 4: Change `packages/core/src/providers/openrouter.ts` so usage can't race between parallel passes**

Change `complete`'s signature and return. The method body is the same up to `this.lastUsage = {...}`:

```ts
  private async complete(
    prompt: string,
    schemaName: string,
    jsonSchema: Record<string, unknown>,
  ): Promise<{ payload: unknown; usage: OpenRouterUsage }> {
```

Replace the tail of `complete`, from `this.lastUsage = {` to the end of the method, with:

```ts
    const usageRow: OpenRouterUsage = {
      promptTokens: usage.prompt_tokens ?? 0,
      completionTokens: usage.completion_tokens ?? 0,
      cost: usage.cost ?? 0,
      generationId: data.id ?? "",
    };
    // Kept for callers that read it after a single call. A thorough review
    // runs passes in parallel on one instance, so the pass's own usage is
    // returned rather than read back off a field another pass may overwrite.
    this.lastUsage = usageRow;
    const content: string = data.choices?.[0]?.message?.content ?? "";
    const jsonStart = content.indexOf("{");
    const jsonEnd = content.lastIndexOf("}");
    if (jsonStart === -1) throw new Error("OpenRouter returned no JSON payload.");
    return { payload: JSON.parse(content.slice(jsonStart, jsonEnd + 1)), usage: usageRow };
  }
```

Replace `review` and `reread` with:

```ts
  async review(input: ReviewInput, onProgress?: (msg: string) => void): Promise<ReviewResult> {
    onProgress?.(`Calling ${this.model} via OpenRouter…`);
    const { payload, usage } = await this.complete(
      buildReviewPrompt(input),
      "review_result",
      reviewResultJsonSchema(),
    );
    input.onUsage?.({ costUsd: usage.cost });
    return ReviewResultSchema.parse(payload);
  }

  async reread(input: RereadInput): Promise<RereadResult> {
    const { payload } = await this.complete(
      buildRereadPrompt(input),
      "reread_result",
      rereadJsonSchema(),
    );
    return RereadResultSchema.parse(payload);
  }
```

- [ ] **Step 5: Run the core tests and confirm they pass**

Run: `pnpm -C packages/core exec vitest run`
Expected: PASS, including `claude-provider.test.ts` (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/providers/claude.ts packages/core/src/providers/openrouter.ts packages/core/test/claude-provider.test.ts
git commit -m "feat(core): providers take a per-pass turn budget and report cost

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `runPasses` orchestrator (core)

**Files:**
- Create: `packages/core/src/passes.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/passes.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/passes.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { KomodoConfigSchema } from "../src/config.js";
import { runPasses, type PassInput } from "../src/passes.js";
import type { ReviewInput, ReviewProvider } from "../src/providers/types.js";
import type { Judgement, ReviewResult } from "../src/schema.js";

const judgement = (over: Partial<Judgement>): Judgement => ({
  path: "src/a.ts",
  line: 1,
  severity: "major",
  kind: "Risk",
  focus: "code",
  tag: "t",
  title: "A thing is true.",
  lede: "l",
  detail: "d",
  ask: "Is it?",
  sources: ["the diff"],
  sourceNote: "s",
  code: "src/a.ts:1 x",
  options: [
    { label: "a", bucket: "Blocks" },
    { label: "b", bucket: "Agreed" },
    { label: "I have a question first", bucket: "Asked" },
    { label: "Not my call", bucket: "Passed on" },
  ],
  fixPrompt: "f",
  ...over,
});

const result = (judgements: Judgement[]): ReviewResult => ({
  summary: "- s",
  walkthrough: [],
  confidence: 3,
  verdict: "v",
  effort: 2,
  verificationChecks: [],
  judgements,
});

const input: PassInput = {
  pr: {
    owner: "acme", repo: "api", number: 1, title: "t", body: "", author: "dev",
    url: "u", baseRef: "main", headRef: "h", headSha: "abc", isDraft: false, labels: [],
  },
  files: [],
  config: KomodoConfigSchema.parse({}),
};

/** Answers each pass with a judgement named after it, and remembers what it was asked. */
function fake(options: { fail?: (input: ReviewInput) => boolean; cost?: number } = {}) {
  const seen: ReviewInput[] = [];
  const provider: ReviewProvider = {
    name: "fake",
    async review(pass) {
      seen.push(pass);
      if (options.fail?.(pass)) throw new Error("boom");
      if (options.cost !== undefined) pass.onUsage?.({ costUsd: options.cost });
      const p = pass.pass;
      if (!p || p.kind === "base") return result([judgement({ line: 1, title: "Base." })]);
      if (p.kind === "lens") {
        return result([
          judgement({ path: "", line: 0, focus: p.focus, title: `Lens ${p.focus}.` }),
          // Off-lens: a lens pass may only contribute its own focus.
          judgement({ path: "src/z.ts", line: 50, focus: "code", title: "Off-lens." }),
        ]);
      }
      return result([judgement({ path: "src/b.ts", line: 9, title: "Second look." })]);
    },
  };
  return { provider, seen };
}

describe("runPasses", () => {
  it("runs one base pass at standard depth", async () => {
    const { provider, seen } = fake();
    const run = await runPasses({ provider, input, depth: "standard" });
    expect(seen.map((s) => s.pass?.kind)).toEqual(["base"]);
    expect(seen[0].turnBudget).toBe(40);
    expect(run.passes).toBe(1);
    expect(run.result.judgements.map((j) => j.title)).toEqual(["Base."]);
  });

  it("follows the base pass with a second look that sees what it raised", async () => {
    const { provider, seen } = fake();
    const run = await runPasses({ provider, input, depth: "deep" });
    expect(seen.map((s) => s.pass?.kind)).toEqual(["base", "second-look"]);
    const second = seen[1].pass;
    expect(second?.kind === "second-look" && second.prior.map((j) => j.title)).toEqual(["Base."]);
    expect(seen.every((s) => s.turnBudget === 60)).toBe(true);
    expect(run.passes).toBe(2);
    expect(run.result.judgements.map((j) => j.title)).toEqual(["Base.", "Second look."]);
  });

  it("runs three lenses beside the base pass, then a second look, at thorough depth", async () => {
    const { provider, seen } = fake();
    const run = await runPasses({ provider, input, depth: "thorough" });
    expect(seen).toHaveLength(5);
    expect(seen.at(-1)?.pass?.kind).toBe("second-look");
    expect(run.passes).toBe(5);
    expect(run.result.judgements.map((j) => j.title)).toEqual([
      "Base.",
      "Lens architecture.",
      "Lens scope.",
      "Lens tests.",
      "Second look.",
    ]);
  });

  it("carries on without a lens that failed, and counts only the passes that returned", async () => {
    const { provider } = fake({
      fail: (i) => i.pass?.kind === "lens" && i.pass.focus === "scope",
    });
    const run = await runPasses({ provider, input, depth: "thorough" });
    expect(run.passes).toBe(4);
    expect(run.result.judgements.map((j) => j.title)).not.toContain("Lens scope.");
  });

  it("fails the run when the base pass fails", async () => {
    const { provider } = fake({ fail: (i) => i.pass?.kind === "base" });
    await expect(runPasses({ provider, input, depth: "deep" })).rejects.toThrow("boom");
  });

  it("sums the cost the provider reported, and says null when it reported none", async () => {
    const priced = await runPasses({ provider: fake({ cost: 0.1 }).provider, input, depth: "thorough" });
    expect(priced.costUsd).toBeCloseTo(0.5);
    const unpriced = await runPasses({ provider: fake().provider, input, depth: "thorough" });
    expect(unpriced.costUsd).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm -C packages/core exec vitest run test/passes.test.ts`
Expected: FAIL with `Cannot find module '../src/passes.js'`.

- [ ] **Step 3: Create `packages/core/src/passes.ts`**

```ts
import { DEPTH_TURNS, type ReviewDepth } from "./depth.js";
import { mergeResults } from "./merge.js";
import type { LensFocus, ReviewInput, ReviewPass, ReviewProvider } from "./providers/types.js";
import type { ReviewResult } from "./schema.js";

const LENSES: readonly LensFocus[] = ["architecture", "scope", "tests"];

/** One review's input, before a pass has been chosen for it. */
export type PassInput = Omit<ReviewInput, "pass" | "turnBudget" | "onUsage">;

export interface PassRun {
  result: ReviewResult;
  /**
   * Passes that returned a result — one credit each. Fewer than
   * DEPTH_PASSES[depth] means an optional pass failed and the run carried on
   * without it, which the review page says rather than hides.
   */
  passes: number;
  /** Summed over the passes that reported a cost; null when none did. */
  costUsd: number | null;
}

/**
 * Runs as many passes as the depth calls for, and merges them.
 *
 * Every pass is an ordinary `provider.review` call, so depth works the same
 * on every provider — what changes per pass is the prompt section and the
 * turn budget. Only the base pass is required. A lens or a second look that
 * fails is reported through `onProgress` and left out; losing one extra pass
 * should cost that pass, not the whole review.
 */
export async function runPasses(opts: {
  provider: ReviewProvider;
  input: PassInput;
  depth: ReviewDepth;
  onProgress?: (msg: string) => void;
}): Promise<PassRun> {
  const { provider, input, depth, onProgress } = opts;
  const tally = { passes: 0, costUsd: null as number | null };
  const turnBudget = DEPTH_TURNS[depth];

  const run = async (pass: ReviewPass): Promise<ReviewResult> => {
    const result = await provider.review(
      {
        ...input,
        pass,
        turnBudget,
        onUsage: (usage) => {
          if (typeof usage.costUsd === "number") {
            tally.costUsd = (tally.costUsd ?? 0) + usage.costUsd;
          }
        },
      },
      onProgress,
    );
    tally.passes++;
    return result;
  };

  const optional = async (pass: ReviewPass, label: string): Promise<ReviewResult | null> => {
    try {
      return await run(pass);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      onProgress?.(`  the ${label} pass failed; continuing without it: ${message}`);
      return null;
    }
  };

  /** A lens may only contribute judgements in its own focus. */
  const lens = async (focus: LensFocus): Promise<ReviewResult | null> => {
    const result = await optional({ kind: "lens", focus }, focus);
    return result && { ...result, judgements: result.judgements.filter((j) => j.focus === focus) };
  };

  if (depth === "standard") {
    const result = await run({ kind: "base" });
    return { result, ...tally };
  }

  let merged: ReviewResult;
  if (depth === "thorough") {
    onProgress?.("  running the base pass and three focused passes in parallel…");
    const [base, ...lenses] = await Promise.all([run({ kind: "base" }), ...LENSES.map(lens)]);
    merged = mergeResults(
      base,
      lenses.filter((r): r is ReviewResult => r !== null),
    );
  } else {
    merged = await run({ kind: "base" });
  }

  onProgress?.("  running a second look for what the earlier passes missed…");
  const second = await optional({ kind: "second-look", prior: merged.judgements }, "second-look");
  if (second) merged = mergeResults(merged, [second]);

  return { result: merged, ...tally };
}
```

- [ ] **Step 4: Export it**

In `packages/core/src/index.ts`, after `export * from "./merge.js";`:

```ts
export * from "./passes.js";
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `pnpm -C packages/core exec vitest run test/passes.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/passes.ts packages/core/src/index.ts packages/core/test/passes.test.ts
git commit -m "feat(core): run one, two or five review passes for a depth and merge them

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `runReview` resolves depth and records the run (core)

**Files:**
- Modify: `packages/core/src/schema.ts` (`ReviewRecordSchema`, currently from line 224)
- Modify: `packages/core/src/pipeline.ts`
- Test: `packages/core/test/pipeline-depth.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/pipeline-depth.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { KomodoConfigSchema } from "../src/config.js";
import type { GitHubClient } from "../src/github.js";
import { runReview } from "../src/pipeline.js";
import type { ReviewInput, ReviewProvider } from "../src/providers/types.js";
import { ReviewRecordSchema, type ReviewResult } from "../src/schema.js";

const result: ReviewResult = {
  summary: "- Adds a limiter",
  walkthrough: [],
  confidence: 3,
  verdict: "Read the limiter.",
  effort: 1,
  verificationChecks: [],
  judgements: [],
};

const github = {
  async getPR(ref: { owner: string; repo: string; number: number }) {
    return {
      ...ref, title: "Limits", body: "", author: "dev", url: "u",
      baseRef: "main", headRef: "limits", headSha: "abc123", isDraft: false,
      labels: ["needs-deep-review"],
    };
  },
  async listFiles() {
    return [
      { path: "src/a.ts", status: "modified", additions: 5, deletions: 1 },
      { path: "src/b.ts", status: "modified", additions: 5, deletions: 1 },
    ];
  },
} as unknown as GitHubClient;

const dirs: string[] = [];
const outDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "komodo-depth-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function counting() {
  const passes: ReviewInput[] = [];
  const provider: ReviewProvider = {
    name: "fake",
    async review(input) {
      passes.push(input);
      return result;
    },
  };
  return { provider, passes };
}

const ref = { owner: "acme", repo: "api", number: 1 };

describe("runReview — depth", () => {
  it("runs a single standard pass when nothing asks for more", async () => {
    const { provider, passes } = counting();
    const outcome = await runReview({
      ref, provider, github, config: KomodoConfigSchema.parse({}), post: false, outDir: outDir(),
    });
    expect(passes).toHaveLength(1);
    expect(outcome.record.run).toEqual({
      depth: "standard", depthReason: "deployment default", passes: 1, costUsd: null,
    });
  });

  it("lets a rule raise the depth", async () => {
    const { provider, passes } = counting();
    const outcome = await runReview({
      ref, provider, github, post: false, outDir: outDir(),
      config: KomodoConfigSchema.parse({ depth: { rules: [{ label: "needs-deep-review", depth: "deep" }] } }),
    });
    expect(passes).toHaveLength(2);
    expect(outcome.record.run?.depthReason).toBe("labelled needs-deep-review");
  });

  it("lets a request override the rules, and records who asked", async () => {
    const { provider, passes } = counting();
    const outcome = await runReview({
      ref, provider, github, post: false, outDir: outDir(),
      config: KomodoConfigSchema.parse({}),
      depthRequest: { depth: "thorough", by: "renata" },
    });
    expect(passes).toHaveLength(5);
    expect(outcome.record.run).toMatchObject({
      depth: "thorough", depthReason: "requested by renata", passes: 5,
    });
    // The record still validates, so `komodo push` can carry it.
    expect(ReviewRecordSchema.parse(outcome.record).run?.depth).toBe("thorough");
  });

  it("still parses a record written before depth existed", () => {
    const { run: _run, ...legacy } = ReviewRecordSchema.parse({
      version: 3, id: "x", createdAt: "2026-01-01T00:00:00Z", provider: "claude",
      pr: { owner: "a", repo: "b", number: 1, title: "t", author: "d", url: "u", baseRef: "m", headRef: "h", headSha: "s" },
      files: [], result, posted: false,
    });
    expect(_run).toBeUndefined();
    expect(legacy.id).toBe("x");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm -C packages/core exec vitest run test/pipeline-depth.test.ts`
Expected: FAIL. `record.run` is undefined and `depthRequest` isn't a known option.

- [ ] **Step 3: Add `run` to `ReviewRecordSchema` in `packages/core/src/schema.ts`**

Add near the other imports at the top of `schema.ts`:

```ts
import { REVIEW_DEPTHS } from "./depth.js";
```

Inside `ReviewRecordSchema`, between `result: ReviewResultSchema,` and `posted: z.boolean(),`, add:

```ts
  /**
   * How hard this run looked — see ./depth.ts.
   *
   * Optional because records written before depth existed, and records an
   * older CLI pushes, carry none. A run that says nothing about its depth was
   * a single standard pass, and the store reads it as one.
   */
  run: z
    .object({
      depth: z.enum(REVIEW_DEPTHS),
      depthReason: z.string(),
      passes: z.number().int().min(1),
      costUsd: z.number().nonnegative().nullable(),
    })
    .optional(),
```

- [ ] **Step 4: Wire depth into `packages/core/src/pipeline.ts`**

Add to the imports:

```ts
import { resolveDepth, type DepthRequest } from "./depth-rules.js";
import { runPasses } from "./passes.js";
```

Add to `RunReviewOptions`, after `model?: string;`:

```ts
  /**
   * A depth someone chose for this run. Overrides the deployment default and
   * every rule in `config.depth` — someone asking for a thorough review of a
   * one-line change gets one. Omitted, the rules decide.
   */
  depthRequest?: DepthRequest | null;
```

Replace the whole `const result = await provider.review(...)` statement:

```ts
  const result = await provider.review(
    { pr, files, config, repoDir: opts.repoDir, memories: opts.memories, sharedContext: shared.docs },
    onProgress,
  );
```

with:

```ts
  // Decided on the reviewable set, after path filters: a lockfile rewrite is
  // not a reason to look harder at the code.
  const decision = resolveDepth(config, { files, labels: pr.labels }, opts.depthRequest);
  onProgress?.(`  depth: ${decision.depth} — ${decision.reason}.`);
  const passRun = await runPasses({
    provider,
    input: { pr, files, config, repoDir: opts.repoDir, memories: opts.memories, sharedContext: shared.docs },
    depth: decision.depth,
    onProgress,
  });
  const result = passRun.result;
```

In the `const record: ReviewRecord = { ... }` literal, add after `result: finalResult,`:

```ts
    run: {
      depth: decision.depth,
      depthReason: decision.reason,
      passes: passRun.passes,
      costUsd: passRun.costUsd,
    },
```

- [ ] **Step 5: Run the core suite and confirm it passes**

Run: `pnpm -C packages/core exec vitest run && pnpm -C packages/core typecheck`
Expected: PASS, and typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/schema.ts packages/core/src/pipeline.ts packages/core/test/pipeline-depth.test.ts
git commit -m "feat(core): runReview resolves depth, fans out passes and records the run

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Store — depth on jobs and runs (both drivers, migration, conformance)

**Files:**
- Modify: `packages/store/src/types.ts` (`AIReviewJob` at line 55, `Review` at line 497; add `ReviewDepth`)
- Modify: `packages/store/src/port.ts` (`ReviewInput` at line 248, `requestAIReview` at line 388)
- Modify: `packages/store/src/migrate.ts` (append to `MIGRATIONS`)
- Modify: `packages/store/src/sqlite.ts` (base DDL ~lines 215 and 264, `requestAIReview` line 1607, `saveReview` line 1757, `toAIReviewJob` line 2097, `toReview` line 2113)
- Modify: `packages/store/src/postgres.ts` (the same four functions: `requestAIReview` 1634, `saveReview` 1786, `toReview` 2048, `toAIReviewJob` 2253; and its base DDL)
- Modify: `packages/store/src/index.ts`
- Test: `packages/store/test/conformance.ts`, `packages/store/test/depth-migration.test.ts`

- [ ] **Step 1: Write the failing conformance tests**

In `packages/store/test/conformance.ts`, inside `describeStore`, directly after the test `"requests one durable AI job per pull-request head"`, add:

```ts
    it("carries a requested depth from the button to the worker", async () => {
      const prId = await store.upsertPullRequest(pr());
      await store.requestAIReview({
        prId, headSha: "aaa111", trigger: "manual",
        requestedBy: "renata", requestedAt: T0, depth: "thorough",
      });
      const claim = await store.claimNextAIReview({ workerId: "w1", now: T0 + 1, leaseMs: 60_000 });
      expect(claim?.job.depth).toBe("thorough");
    });

    it("leaves an automatic job's depth to the rules", async () => {
      const prId = await store.upsertPullRequest(pr());
      await store.requestAIReview({ prId, headSha: "aaa111", trigger: "new_pull_request", requestedAt: T0 });
      expect((await store.listAIReviewJobs())[0].depth).toBeNull();
    });

    it("lets a second explicit request change the depth it asked for", async () => {
      const prId = await store.upsertPullRequest(pr());
      await store.requestAIReview({ prId, headSha: "aaa111", trigger: "manual", requestedAt: T0, depth: "deep" });
      await store.requestAIReview({ prId, headSha: "aaa111", trigger: "manual", requestedAt: T0 + 1, depth: "thorough" });
      expect((await store.listAIReviewJobs())[0].depth).toBe("thorough");
    });

    it("round-trips how hard a run looked", async () => {
      const prId = await store.upsertPullRequest(pr());
      const reviewId = await store.saveReview(
        review({
          prId, depth: "thorough",
          depthReason: "31 files changed (rule: at least 28)",
          passes: 4, costUsd: 1.25,
        }),
      );
      expect((await store.loadReview(reviewId))?.review).toMatchObject({
        depth: "thorough",
        depthReason: "31 files changed (rule: at least 28)",
        passes: 4,
        costUsd: 1.25,
      });
    });

    it("reads a run that never said how hard it looked as one standard pass", async () => {
      const prId = await store.upsertPullRequest(pr());
      const reviewId = await store.saveReview(review({ prId }));
      expect((await store.loadReview(reviewId))?.review).toMatchObject({
        depth: "standard", depthReason: "", passes: 1, costUsd: null,
      });
    });
```

- [ ] **Step 2: Write the failing migration test**

Create `packages/store/test/depth-migration.test.ts`:

```ts
import { DatabaseSync } from "node:sqlite";

import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

import { MIGRATIONS, runPostgresMigrations, runSqliteMigrations } from "../src/migrate.js";

/** Named, not positioned — see verification-migration.test.ts for why. */
const TARGET = "016-review-depth";
const others = MIGRATIONS.filter((m) => m.id !== TARGET);

describe("review depth migration", () => {
  it("reads every existing SQLite run as one standard pass", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(`CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, appliedAt INTEGER NOT NULL);
        CREATE TABLE reviews (id TEXT PRIMARY KEY);
        CREATE TABLE ai_review_jobs (id TEXT PRIMARY KEY);
        INSERT INTO reviews VALUES ('r1');
        INSERT INTO ai_review_jobs VALUES ('j1');`);
      const mark = db.prepare("INSERT INTO schema_migrations (id, appliedAt) VALUES (?, 1)");
      others.forEach((m) => mark.run(m.id));

      runSqliteMigrations(db, 2);

      expect(db.prepare("SELECT depth, depthReason, passes, costUsd FROM reviews").get()).toEqual({
        depth: "standard", depthReason: "", passes: 1, costUsd: null,
      });
      expect(db.prepare("SELECT depth FROM ai_review_jobs").get()).toEqual({ depth: null });
    } finally {
      db.close();
    }
  });

  it("does the same on Postgres", async () => {
    const pg = new PGlite();
    const sql = {
      query: async <T,>(text: string, params?: unknown[]) => ({
        rows: (await pg.query(text, params as never[])).rows as T[],
      }),
      exec: async (text: string) => {
        await pg.exec(text);
      },
    };
    await pg.exec(`CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, "appliedAt" BIGINT NOT NULL);
      CREATE TABLE reviews (id TEXT PRIMARY KEY);
      CREATE TABLE ai_review_jobs (id TEXT PRIMARY KEY);
      INSERT INTO reviews VALUES ('r1');
      INSERT INTO ai_review_jobs VALUES ('j1');`);
    for (const m of others) {
      await pg.query(`INSERT INTO schema_migrations (id, "appliedAt") VALUES ($1, 1)`, [m.id]);
    }

    await runPostgresMigrations(sql, 2);

    const { rows } = await pg.query(`SELECT depth, "depthReason", passes, "costUsd" FROM reviews`);
    expect(rows[0]).toEqual({ depth: "standard", depthReason: "", passes: 1, costUsd: null });
    await pg.close();
  });
});
```

- [ ] **Step 3: Run both and confirm they fail**

Run: `pnpm -C packages/store exec vitest run test/sqlite.test.ts test/postgres.test.ts test/depth-migration.test.ts`
Expected: FAIL. TypeScript rejects `depth` on `requestAIReview` and on `ReviewInput`, and the migration `016-review-depth` doesn't exist.

- [ ] **Step 4: Add the types (`packages/store/src/types.ts`)**

Above `export interface AIReviewJob {` add:

```ts
/**
 * How hard a review run looked. Mirrors @komodo/core's REVIEW_DEPTHS;
 * packages/ingest/test/settings.test.ts asserts the two lists agree.
 */
export type ReviewDepth = "standard" | "deep" | "thorough";
```

Add to `AIReviewJob`, after `lastError: string | null;`:

```ts
  /**
   * The depth someone picked when they asked for this run. Null for a job the
   * poller started, and for a request that left the depth to the rules.
   */
  depth: ReviewDepth | null;
```

Add to `Review`, after `recordId: string;`:

```ts
  /** How hard this run looked. A run from before depth existed reads as standard. */
  depth: ReviewDepth;
  /** Why it ran at that depth — a rule, a person, or the default. Empty when unknown. */
  depthReason: string;
  /** Model passes that returned a result. Fewer than the depth plans means one failed. */
  passes: number;
  /** What the provider said the run cost, in USD. Null when it said nothing. */
  costUsd: number | null;
```

- [ ] **Step 5: Extend the port (`packages/store/src/port.ts`)**

Add `ReviewDepth` to the `import type { ... } from "./types.js"` list.

In `ReviewInput`, after `recordId: string;`, add:

```ts
  /** Omitted by callers that predate depth; stored as one standard pass. */
  depth?: ReviewDepth;
  depthReason?: string;
  passes?: number;
  costUsd?: number | null;
```

In `requestAIReview`'s input type, after `requestedAt: number;`, add:

```ts
    /** A depth the requester picked. Ignored on an automatic re-request, like every other field. */
    depth?: ReviewDepth | null;
```

- [ ] **Step 6: Add the migration (`packages/store/src/migrate.ts`)**

Append to `MIGRATIONS`, after the `015-member-github-identities` entry:

```ts
  {
    id: "016-review-depth",
    // A run written before depth existed was one standard pass, which is
    // exactly what these defaults say — so no backfill is needed.
    addColumns: [
      { table: "ai_review_jobs", column: "depth", sqlite: "TEXT", postgres: "TEXT" },
      {
        table: "reviews",
        column: "depth",
        sqlite: "TEXT NOT NULL DEFAULT 'standard'",
        postgres: "TEXT NOT NULL DEFAULT 'standard'",
      },
      {
        table: "reviews",
        column: "depthReason",
        sqlite: "TEXT NOT NULL DEFAULT ''",
        postgres: "TEXT NOT NULL DEFAULT ''",
      },
      {
        table: "reviews",
        column: "passes",
        sqlite: "INTEGER NOT NULL DEFAULT 1",
        postgres: "INTEGER NOT NULL DEFAULT 1",
      },
      { table: "reviews", column: "costUsd", sqlite: "REAL", postgres: "DOUBLE PRECISION" },
    ],
  },
```

- [ ] **Step 7: SQLite driver (`packages/store/src/sqlite.ts`)**

(a) Base DDL. In `CREATE TABLE IF NOT EXISTS ai_review_jobs`, change `lastError      TEXT` to:

```sql
  lastError      TEXT,
  depth          TEXT
```

In `CREATE TABLE IF NOT EXISTS reviews`, change `receiptPostedAt INTEGER,` (the line before `createdAt`) to:

```sql
  receiptPostedAt INTEGER,
  depth       TEXT NOT NULL DEFAULT 'standard',
  depthReason TEXT NOT NULL DEFAULT '',
  passes      INTEGER NOT NULL DEFAULT 1,
  costUsd     REAL,
```

(b) `requestAIReview`. Add `depth?: AIReviewJob["depth"];` to its input type. Replace the SQL and the `.run(...)` arguments with:

```ts
    this.db.prepare(
      `INSERT INTO ai_review_jobs
         (id, prId, headSha, trigger, state, requestedBy, requestedAt,
          updatedAt, workerId, leaseExpiresAt, lastError, depth)
       VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, NULL, NULL, NULL, ?)
       ON CONFLICT (id) DO UPDATE SET
         trigger = excluded.trigger,
         state = 'queued',
         requestedBy = excluded.requestedBy,
         requestedAt = excluded.requestedAt,
         updatedAt = excluded.updatedAt,
         workerId = NULL,
         leaseExpiresAt = NULL,
         lastError = NULL,
         depth = excluded.depth
       WHERE excluded.trigger IN ('manual', 'interactive')
         AND ai_review_jobs.state != 'running'`,
    ).run(
      id,
      input.prId,
      input.headSha,
      input.trigger,
      input.requestedBy ?? null,
      input.requestedAt,
      input.requestedAt,
      input.depth ?? null,
    );
```

(c) `saveReview`. Replace the reviews INSERT statement and its `.run(...)` with:

```ts
      this.db
        .prepare(
          // `seq` is not in the DO UPDATE list: a re-run of the same head
          // keeps the position it already had in the history.
          `INSERT INTO reviews
             (id, version, prId, headSha, seq, provider, model, summary, walkthrough,
              confidence, effort, verdictLine, diagram, recordId,
              depth, depthReason, passes, costUsd, createdAt)
           VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM reviews),
                   ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET
             version = excluded.version,
             provider = excluded.provider, model = excluded.model,
             summary = excluded.summary, walkthrough = excluded.walkthrough,
             confidence = excluded.confidence, effort = excluded.effort,
             verdictLine = excluded.verdictLine, diagram = excluded.diagram,
             recordId = excluded.recordId,
             depth = excluded.depth, depthReason = excluded.depthReason,
             passes = excluded.passes, costUsd = excluded.costUsd`,
        )
        .run(
          id, input.version, input.prId, input.headSha, input.provider, input.model ?? null,
          input.summary, JSON.stringify(input.walkthrough),
          input.confidence, input.effort, input.verdictLine,
          input.diagram ? JSON.stringify(input.diagram) : null, input.recordId,
          input.depth ?? "standard", input.depthReason ?? "", input.passes ?? 1,
          input.costUsd ?? null, now,
        );
```

(d) Mappers. In `toAIReviewJob`, add after `lastError: ...`:

```ts
    depth: r.depth == null ? null : (str(r.depth) as AIReviewJob["depth"]),
```

In `toReview`, add after `recordId: str(r.recordId),`:

```ts
    depth: (r.depth == null ? "standard" : str(r.depth)) as Review["depth"],
    depthReason: r.depthReason == null ? "" : str(r.depthReason),
    passes: r.passes == null ? 1 : num(r.passes),
    costUsd: r.costUsd == null ? null : num(r.costUsd),
```

- [ ] **Step 8: Postgres driver (`packages/store/src/postgres.ts`)**

(a) Base DDL. In `CREATE TABLE IF NOT EXISTS ai_review_jobs`, change `"lastError"      TEXT` to:

```sql
  "lastError"      TEXT,
  depth            TEXT
```

In `CREATE TABLE IF NOT EXISTS reviews`, change `"receiptPostedAt" BIGINT,` to:

```sql
  "receiptPostedAt" BIGINT,
  depth         TEXT NOT NULL DEFAULT 'standard',
  "depthReason" TEXT NOT NULL DEFAULT '',
  passes        INTEGER NOT NULL DEFAULT 1,
  "costUsd"     DOUBLE PRECISION,
```

(b) `requestAIReview`. Add `depth?: AIReviewJob["depth"];` to its input type, and replace the query and parameters with:

```ts
    await this.sql.query(
      `INSERT INTO ai_review_jobs
         (id, "prId", "headSha", trigger, state, "requestedBy",
          "requestedAt", "updatedAt", "workerId", "leaseExpiresAt", "lastError", depth)
       VALUES ($1,$2,$3,$4,'queued',$5,$6,$6,NULL,NULL,NULL,$7)
       ON CONFLICT (id) DO UPDATE SET
         trigger = EXCLUDED.trigger,
         state = 'queued',
         "requestedBy" = EXCLUDED."requestedBy",
         "requestedAt" = EXCLUDED."requestedAt",
         "updatedAt" = EXCLUDED."updatedAt",
         "workerId" = NULL,
         "leaseExpiresAt" = NULL,
         "lastError" = NULL,
         depth = EXCLUDED.depth
       WHERE EXCLUDED.trigger IN ('manual', 'interactive')
         AND ai_review_jobs.state != 'running'`,
      [
        id,
        input.prId,
        input.headSha,
        input.trigger,
        input.requestedBy ?? null,
        input.requestedAt,
        input.depth ?? null,
      ],
    );
```

(c) `saveReview`. Replace the reviews INSERT query and parameters with:

```ts
      await this.sql.query(
        // `seq` is not in the DO UPDATE list: a re-run of the same head keeps
        // the position it already had in the history.
        `INSERT INTO reviews
           (id, version, "prId", "headSha", seq, provider, model, summary, walkthrough,
            confidence, effort, "verdictLine", diagram, "recordId",
            depth, "depthReason", passes, "costUsd", "createdAt")
         VALUES ($1,$2,$3,$4,(SELECT COALESCE(MAX(seq), 0) + 1 FROM reviews),
                 $5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         ON CONFLICT (id) DO UPDATE SET
           version = EXCLUDED.version,
           provider = EXCLUDED.provider, model = EXCLUDED.model,
           summary = EXCLUDED.summary, walkthrough = EXCLUDED.walkthrough,
           confidence = EXCLUDED.confidence, effort = EXCLUDED.effort,
           "verdictLine" = EXCLUDED."verdictLine", diagram = EXCLUDED.diagram,
           "recordId" = EXCLUDED."recordId",
           depth = EXCLUDED.depth, "depthReason" = EXCLUDED."depthReason",
           passes = EXCLUDED.passes, "costUsd" = EXCLUDED."costUsd"`,
        [
          id, input.version, input.prId, input.headSha, input.provider, input.model ?? null,
          input.summary, JSON.stringify(input.walkthrough),
          input.confidence, input.effort, input.verdictLine,
          input.diagram ? JSON.stringify(input.diagram) : null, input.recordId,
          input.depth ?? "standard", input.depthReason ?? "", input.passes ?? 1,
          input.costUsd ?? null, now,
        ],
      );
```

(d) Mappers: add the same lines as Step 7(d) to `toAIReviewJob` and `toReview` in this file.

- [ ] **Step 9: Export the type**

In `packages/store/src/index.ts`, add `ReviewDepth,` to the first `export type { ... } from "./types.js"` block, keeping it alphabetical.

- [ ] **Step 10: Run the store suite and confirm it passes**

Run: `pnpm -C packages/store exec vitest run && pnpm -C packages/store typecheck`
Expected: PASS on both drivers (the conformance suite runs under `sqlite.test.ts` and `postgres.test.ts`) and in `depth-migration.test.ts`.

- [ ] **Step 11: Commit**

```bash
git add packages/store
git commit -m "feat(store): record requested and actual review depth on jobs and runs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Store — `reviewRuns` read-model on the snapshot

**Files:**
- Modify: `packages/store/src/types.ts` (add `ReviewRunOutcome`)
- Modify: `packages/store/src/port.ts` (`QueueSnapshot`, line 55)
- Modify: `packages/store/src/sqlite.ts` (`snapshot()` at line 537; new private `readReviewRuns` next to `readJudgments`)
- Modify: `packages/store/src/postgres.ts` (`snapshot()` ~line 585; new private `readReviewRuns`)
- Modify: `packages/store/src/index.ts`
- Test: `packages/store/test/conformance.ts`

- [ ] **Step 1: Write the failing conformance tests**

In `packages/store/test/conformance.ts`, inside `describeStore`, add:

```ts
    describe("review run outcomes", () => {
      it("derives upheld counts from each judgement's newest answer", async () => {
        const prId = await store.upsertPullRequest(pr({ changedFiles: 31 }));
        // The fixture's judgement 0 is major and judgement 1 is minor.
        const reviewId = await store.saveReview(review({ prId, depth: "deep", passes: 2, costUsd: 0.3 }));
        await store.recordAnswer({
          judgementId: `${reviewId}:0`, actorLogin: "renata", bucket: "Blocks", optionLabel: "No",
        });
        await store.recordAnswer({
          judgementId: `${reviewId}:1`, actorLogin: "renata", bucket: "Passed on", optionLabel: "Not my call",
        });

        const [run] = (await store.snapshot()).reviewRuns;
        expect(run).toMatchObject({
          reviewId, prId, repoId: "acme/api", author: "renata",
          depth: "deep", passes: 2, costUsd: 0.3, changedFiles: 31,
          judgements: 2, severeJudgements: 1, upheld: 1, severeUpheld: 1,
        });
      });

      it("stops counting a judgement as upheld once the answer is withdrawn", async () => {
        const prId = await store.upsertPullRequest(pr());
        const reviewId = await store.saveReview(review({ prId }));
        await store.recordAnswer({
          judgementId: `${reviewId}:0`, actorLogin: "renata", bucket: "Agreed", optionLabel: "Yes",
        });
        await store.recordAnswer({ judgementId: `${reviewId}:0`, actorLogin: "renata", bucket: null });

        const [run] = (await store.snapshot()).reviewRuns;
        expect(run.upheld).toBe(0);
      });

      it("lists every run, oldest first, not only each pull request's newest", async () => {
        const prId = await store.upsertPullRequest(pr());
        await store.saveReview(review({ prId }));
        await store.saveReview(review({ prId, headSha: "bbb222", depth: "thorough", passes: 5 }));

        const runs = (await store.snapshot()).reviewRuns;
        expect(runs.map((r) => r.depth)).toEqual(["standard", "thorough"]);
      });
    });
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm -C packages/store exec vitest run test/sqlite.test.ts`
Expected: FAIL. `reviewRuns` is undefined.

- [ ] **Step 3: Add the type (`packages/store/src/types.ts`)**

Add after the `Review` interface:

```ts
/**
 * One review run and what people made of it.
 *
 * The row the depth panel and the usage screen count from. Every number is
 * derived at read time from the run's own judgements and the answer ledger
 * (AGENTS.md rule 4) — none of it is a column anything writes.
 */
export interface ReviewRunOutcome {
  reviewId: string;
  prId: string;
  repoId: string;
  author: string;
  createdAt: number;
  depth: ReviewDepth;
  depthReason: string;
  passes: number;
  costUsd: number | null;
  /** The pull request's changed files as GitHub last reported them. */
  changedFiles: number;
  judgements: number;
  /** Critical or major. */
  severeJudgements: number;
  /** Judgements whose newest answer is Blocks or Agreed: a person said it was real. */
  upheld: number;
  severeUpheld: number;
}
```

- [ ] **Step 4: Add it to the snapshot type (`packages/store/src/port.ts`)**

Add `ReviewRunOutcome` to the types import, and add to `QueueSnapshot` after `judgments: Judgment[];`:

```ts
  /** Every review run, oldest first, with its outcome derived from the ledger. */
  reviewRuns: ReviewRunOutcome[];
```

- [ ] **Step 5: SQLite (`packages/store/src/sqlite.ts`)**

Add `ReviewRunOutcome` to the types import. In `snapshot()`, add after `judgments: this.readJudgments(),`:

```ts
      reviewRuns: this.readReviewRuns(),
```

Add next to `readJudgments`:

```ts
  private readReviewRuns(): ReviewRunOutcome[] {
    // Upheld means the newest ledger entry says Blocks or Agreed — the same
    // "newest answer wins" rule readJudgments uses, so withdrawing an answer
    // un-upholds it here too.
    const rows = this.db
      .prepare(
        `WITH newest_answer AS (
           SELECT judgementId, bucket,
                  ROW_NUMBER() OVER (
                    PARTITION BY judgementId ORDER BY createdAt DESC, id DESC
                  ) AS rn
           FROM answers
         ),
         judged AS (
           SELECT q.reviewId,
                  q.severity IN ('critical', 'major') AS severe,
                  a.bucket IN ('Blocks', 'Agreed') AS upheld
           FROM review_judgements q
           LEFT JOIN newest_answer a ON a.judgementId = q.id AND a.rn = 1
         )
         SELECT r.id AS reviewId, r.prId, p.repoId, p.author, r.createdAt,
                r.depth, r.depthReason, r.passes, r.costUsd, p.changedFiles,
                (SELECT COUNT(*) FROM judged j WHERE j.reviewId = r.id) AS judgements,
                (SELECT COUNT(*) FROM judged j WHERE j.reviewId = r.id AND j.severe)
                  AS severeJudgements,
                (SELECT COUNT(*) FROM judged j WHERE j.reviewId = r.id AND j.upheld)
                  AS upheld,
                (SELECT COUNT(*) FROM judged j
                  WHERE j.reviewId = r.id AND j.upheld AND j.severe) AS severeUpheld
         FROM reviews r
         JOIN pull_requests p ON p.id = r.prId
         ORDER BY r.seq`,
      )
      .all() as Row[];

    return rows.map((r) => ({
      reviewId: str(r.reviewId),
      prId: str(r.prId),
      repoId: str(r.repoId),
      author: str(r.author),
      createdAt: num(r.createdAt),
      depth: str(r.depth) as ReviewRunOutcome["depth"],
      depthReason: str(r.depthReason),
      passes: num(r.passes),
      costUsd: r.costUsd == null ? null : num(r.costUsd),
      changedFiles: num(r.changedFiles),
      judgements: num(r.judgements),
      severeJudgements: num(r.severeJudgements),
      upheld: num(r.upheld),
      severeUpheld: num(r.severeUpheld),
    }));
  }
```

- [ ] **Step 6: Postgres (`packages/store/src/postgres.ts`)**

Add `ReviewRunOutcome` to the types import. In `snapshot()`, add `reviewRuns` to the destructured names after `judgments,`, add `this.readReviewRuns(),` after `this.readJudgments(),` in the `Promise.all` array (same position), and add `reviewRuns,` to the returned object after `judgments,`.

Add the method next to `readJudgments`:

```ts
  private async readReviewRuns(): Promise<ReviewRunOutcome[]> {
    // The mirror of the SQLite driver's query. COUNT is cast because Postgres
    // returns bigint, which the driver hands back as a string.
    const { rows } = await this.sql.query<Row>(
      `WITH newest_answer AS (
         SELECT "judgementId", bucket,
                ROW_NUMBER() OVER (
                  PARTITION BY "judgementId" ORDER BY "createdAt" DESC, id DESC
                ) AS rn
         FROM answers
       ),
       judged AS (
         SELECT q."reviewId",
                q.severity IN ('critical', 'major') AS severe,
                COALESCE(a.bucket IN ('Blocks', 'Agreed'), false) AS upheld
         FROM review_judgements q
         LEFT JOIN newest_answer a ON a."judgementId" = q.id AND a.rn = 1
       )
       SELECT r.id AS "reviewId", r."prId", p."repoId", p.author, r."createdAt",
              r.depth, r."depthReason", r.passes, r."costUsd", p."changedFiles",
              (SELECT COUNT(*)::int FROM judged j WHERE j."reviewId" = r.id) AS judgements,
              (SELECT COUNT(*)::int FROM judged j WHERE j."reviewId" = r.id AND j.severe)
                AS "severeJudgements",
              (SELECT COUNT(*)::int FROM judged j WHERE j."reviewId" = r.id AND j.upheld)
                AS upheld,
              (SELECT COUNT(*)::int FROM judged j
                WHERE j."reviewId" = r.id AND j.upheld AND j.severe) AS "severeUpheld"
       FROM reviews r
       JOIN pull_requests p ON p.id = r."prId"
       ORDER BY r.seq`,
    );

    return rows.map((r) => ({
      reviewId: str(r.reviewId),
      prId: str(r.prId),
      repoId: str(r.repoId),
      author: str(r.author),
      createdAt: num(r.createdAt),
      depth: str(r.depth) as ReviewRunOutcome["depth"],
      depthReason: str(r.depthReason),
      passes: num(r.passes),
      costUsd: r.costUsd == null ? null : num(r.costUsd),
      changedFiles: num(r.changedFiles),
      judgements: num(r.judgements),
      severeJudgements: num(r.severeJudgements),
      upheld: num(r.upheld),
      severeUpheld: num(r.severeUpheld),
    }));
  }
```

Before you run it, check the column quoting against this driver's `CREATE TABLE answers` and `CREATE TABLE review_judgements` DDL. Every camelCase column there is double-quoted; if one isn't, match the DDL.

- [ ] **Step 7: Export the type**

Add `ReviewRunOutcome,` to the first `export type { ... } from "./types.js"` block in `packages/store/src/index.ts`.

- [ ] **Step 8: Run the store suite and confirm it passes**

Run: `pnpm -C packages/store exec vitest run && pnpm -C packages/store typecheck`
Expected: PASS on both drivers.

- [ ] **Step 9: Commit**

```bash
git add packages/store
git commit -m "feat(store): derive every review run's outcome onto the snapshot

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Store — client-safe depth helpers

**Files:**
- Create: `packages/store/src/depth.ts`
- Modify: `packages/store/src/index.ts`
- Test: `packages/store/test/depth.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/store/test/depth.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { describeDepth, sizeBand, summarizeDepthOutcomes } from "../src/depth.js";
import type { ReviewRunOutcome } from "../src/types.js";

const run = (over: Partial<ReviewRunOutcome> = {}): ReviewRunOutcome => ({
  reviewId: "r", prId: "p", repoId: "acme/api", author: "renata", createdAt: 0,
  depth: "standard", depthReason: "", passes: 1, costUsd: null, changedFiles: 3,
  judgements: 2, severeJudgements: 1, upheld: 1, severeUpheld: 1,
  ...over,
});

describe("sizeBand", () => {
  it("puts the boundaries where the panel says they are", () => {
    expect(sizeBand(10)).toBe("small");
    expect(sizeBand(11)).toBe("medium");
    expect(sizeBand(27)).toBe("medium");
    expect(sizeBand(28)).toBe("large");
  });
});

describe("summarizeDepthOutcomes", () => {
  it("reports upheld critical and major judgements per run, per band and depth", () => {
    const table = summarizeDepthOutcomes([
      run({ changedFiles: 30, depth: "thorough", severeUpheld: 3, passes: 5, costUsd: 1 }),
      run({ changedFiles: 40, depth: "thorough", severeUpheld: 1, passes: 4, costUsd: 0.5 }),
      run({ changedFiles: 2, depth: "standard", severeUpheld: 0 }),
    ]);
    expect(table.large.thorough).toEqual({
      runs: 2, severeUpheld: 4, upheld: 2, passes: 9, costUsd: 1.5, severeUpheldPerRun: 2,
    });
    expect(table.small.standard.severeUpheldPerRun).toBe(0);
  });

  it("leaves a cell with no runs empty rather than zero", () => {
    expect(summarizeDepthOutcomes([]).medium.deep).toEqual({
      runs: 0, severeUpheld: 0, upheld: 0, passes: 0, costUsd: null, severeUpheldPerRun: null,
    });
  });
});

describe("describeDepth", () => {
  it("says how many passes a full run made, and why it ran at that depth", () => {
    expect(describeDepth({ depth: "thorough", passes: 5, depthReason: "labelled risky" })).toBe(
      "Thorough · 5 passes — labelled risky",
    );
  });

  it("says when a run lost a pass", () => {
    expect(describeDepth({ depth: "thorough", passes: 4, depthReason: "" })).toBe(
      "Thorough · 4 of 5 passes",
    );
  });

  it("uses the singular for one pass", () => {
    expect(describeDepth({ depth: "standard", passes: 1, depthReason: "deployment default" })).toBe(
      "Standard · 1 pass — deployment default",
    );
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm -C packages/store exec vitest run test/depth.test.ts`
Expected: FAIL with `Cannot find module '../src/depth.js'`.

- [ ] **Step 3: Create `packages/store/src/depth.ts`**

```ts
/**
 * Review depth, for the screens.
 *
 * Re-declared rather than imported from @komodo/core for the reason every
 * vocabulary in this package is: no dependency on core, and client components
 * import from here. packages/ingest/test/settings.test.ts asserts these
 * tables equal core's, so the two cannot drift silently.
 */
import type { ReviewDepth, ReviewRunOutcome } from "./types.js";

export const REVIEW_DEPTH_ORDER: readonly ReviewDepth[] = ["standard", "deep", "thorough"];

/** Passes a full run at each depth makes. One pass is one credit. */
export const DEPTH_PASSES: Record<ReviewDepth, number> = {
  standard: 1,
  deep: 2,
  thorough: 5,
};

export const DEPTH_LABEL: Record<ReviewDepth, string> = {
  standard: "Standard",
  deep: "Deep",
  thorough: "Thorough",
};

export const SIZE_BANDS = [
  { key: "small", label: "1–10 files", max: 10 },
  { key: "medium", label: "11–27 files", max: 27 },
  { key: "large", label: "28+ files", max: Number.POSITIVE_INFINITY },
] as const;
export type SizeBand = (typeof SIZE_BANDS)[number]["key"];

export function sizeBand(changedFiles: number): SizeBand {
  return SIZE_BANDS.find((band) => changedFiles <= band.max)!.key;
}

export interface DepthCell {
  runs: number;
  severeUpheld: number;
  upheld: number;
  passes: number;
  /** Summed over runs that reported one; null when none did. */
  costUsd: number | null;
  /** The panel's number. Null — shown as a dash — when the cell has no runs. */
  severeUpheldPerRun: number | null;
}

const emptyCell = (): DepthCell => ({
  runs: 0, severeUpheld: 0, upheld: 0, passes: 0, costUsd: null, severeUpheldPerRun: null,
});

/**
 * Whether looking harder found more of what people upheld, by PR size.
 *
 * "Upheld" is a person's answer — Blocks or Agreed — not the model's own
 * severity, so a depth that only produces more noise does not score better.
 */
export function summarizeDepthOutcomes(
  runs: readonly ReviewRunOutcome[],
): Record<SizeBand, Record<ReviewDepth, DepthCell>> {
  const table = Object.fromEntries(
    SIZE_BANDS.map((band) => [
      band.key,
      Object.fromEntries(REVIEW_DEPTH_ORDER.map((d) => [d, emptyCell()])),
    ]),
  ) as Record<SizeBand, Record<ReviewDepth, DepthCell>>;

  for (const run of runs) {
    const cell = table[sizeBand(run.changedFiles)][run.depth];
    cell.runs++;
    cell.severeUpheld += run.severeUpheld;
    cell.upheld += run.upheld;
    cell.passes += run.passes;
    if (run.costUsd !== null) cell.costUsd = (cell.costUsd ?? 0) + run.costUsd;
  }
  for (const band of Object.values(table)) {
    for (const cell of Object.values(band)) {
      cell.severeUpheldPerRun = cell.runs ? cell.severeUpheld / cell.runs : null;
    }
  }
  return table;
}

/** The run line on the review page: depth, passes, and why. */
export function describeDepth(run: {
  depth: ReviewDepth;
  passes: number;
  depthReason: string;
}): string {
  const planned = DEPTH_PASSES[run.depth];
  const passes =
    run.passes === planned
      ? `${run.passes} ${run.passes === 1 ? "pass" : "passes"}`
      : `${run.passes} of ${planned} passes`;
  const reason = run.depthReason ? ` — ${run.depthReason}` : "";
  return `${DEPTH_LABEL[run.depth]} · ${passes}${reason}`;
}
```

- [ ] **Step 4: Export the runtime helpers**

In `packages/store/src/index.ts`, after `export { DEFAULT_ORG_SETTINGS, mergeSettings } from "./settings.js";`:

```ts
export {
  DEPTH_LABEL,
  DEPTH_PASSES,
  REVIEW_DEPTH_ORDER,
  SIZE_BANDS,
  describeDepth,
  sizeBand,
  summarizeDepthOutcomes,
  type DepthCell,
  type SizeBand,
} from "./depth.js";
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `pnpm -C packages/store exec vitest run test/depth.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/store/src/depth.ts packages/store/src/index.ts packages/store/test/depth.test.ts
git commit -m "feat(store): client-safe depth vocabulary and outcome summary

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Store — settings defaults and a seeded dataset with depth

**Files:**
- Modify: `packages/store/src/types.ts` (`OrgSettings` at line 417; add `DepthRuleSetting`)
- Modify: `packages/store/src/settings.ts`
- Modify: `packages/store/src/seed.ts` (the `changedFiles:` line in the PR loop; `buildReview` at line 741 and its call)
- Modify: `packages/store/src/index.ts`
- Test: `packages/store/test/seed.test.ts` (append)

- [ ] **Step 1: Write the failing seed test**

Append to `packages/store/test/seed.test.ts`. Use that file's own pattern for opening a store and seeding; the existing tests show it. Add:

```ts
  it("seeds runs at more than one depth, through the port", async () => {
    const runs = (await store.snapshot()).reviewRuns;
    expect(runs.length).toBeGreaterThan(0);
    expect(new Set(runs.map((r) => r.depth)).size).toBeGreaterThan(1);
    for (const r of runs) {
      expect(r.passes).toBe({ standard: 1, deep: 2, thorough: 5 }[r.depth]);
    }
  });
```

Place it inside the `describe` block that already has a seeded `store` in scope.

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm -C packages/store exec vitest run test/seed.test.ts`
Expected: FAIL. Every seeded run is `standard`, so the set has size 1.

- [ ] **Step 3: Add the settings type (`packages/store/src/types.ts`)**

Above `export interface OrgSettings {` add:

```ts
/**
 * One row of the settings screen's "Go deeper when" list. Mirrors one rule in
 * komodo.yaml's `depth.rules`; packages/ingest/src/settings.ts translates.
 */
export interface DepthRuleSetting {
  /** What is measured: changed files, changed lines, a path glob, or a label. */
  kind: "files" | "lines" | "path" | "label";
  /** A whole number of at least 1 for files and lines; a glob or a label otherwise. */
  value: string;
  depth: ReviewDepth;
}
```

Add to `OrgSettings`, after `memoryEnabled: boolean;`:

```ts
  /** The depth a review runs at when no rule and no person says otherwise. */
  reviewDepth: ReviewDepth;
  /**
   * Reasons to spend more on a review. The deepest matching rule wins, and
   * none of them can take a review below `reviewDepth`.
   */
  depthRules: DepthRuleSetting[];
```

Export `DepthRuleSetting` from `packages/store/src/index.ts` in the first type block.

- [ ] **Step 4: Defaults (`packages/store/src/settings.ts`)**

Add to `DEFAULT_ORG_SETTINGS`, after `memoryEnabled: true,`:

```ts
  // One pass and no rules, matching @komodo/core's `depth` defaults: a
  // deployment that never opens this screen reviews exactly as it did before
  // depth existed, and spends no more of its subscription.
  reviewDepth: "standard",
  depthRules: [],
```

- [ ] **Step 5: Seed real depth (`packages/store/src/seed.ts`)**

Add `ReviewDepth` to the `import type { ... } from "./types.js"` list, and add:

```ts
import { DEPTH_PASSES } from "./depth.js";
```

In the PR loop, the upsert object currently draws `changedFiles: 1 + Math.floor(next() * 18),` inline. The value is needed again after the upsert, so draw it into a variable instead, **at the same position in the draw order**. `additions` and `deletions` are drawn just before it inside the object literal, so hoist all three, in order, just above `const prId = await store.upsertPullRequest({`:

```ts
    const additions = Math.floor(next() * 400);
    const deletions = Math.floor(next() * 160);
    // Skewed so a few pull requests are large: the depth panel's 28+ band is
    // the one that matters, and an even 1–18 spread never reaches it. Still
    // one draw, in the same place, so every later draw is unchanged.
    const changedFiles = 1 + Math.floor(Math.pow(next(), 3) * 60);
```

But `isDraft: state === "open" && next() < 0.08,` and `title: pick(next, TITLE_SHAPES)(next),` also draw **inside** the object literal, and they come *before* `additions` in it. Hoisting the three lines above would move them ahead of those draws and reshuffle the whole dataset. So hoist `title` and `isDraft` too, first, in their original order:

```ts
    const title = pick(next, TITLE_SHAPES)(next);
    const isDraft = state === "open" && next() < 0.08;
```

Then in the upsert object use `title,`, `isDraft,`, `additions,`, `deletions,` and `changedFiles,` (shorthand) instead of the inline expressions. Read the object literal top to bottom once more and confirm that every `next()` it used to make is now made by a hoisted line, in the same order.

Add above `function buildReview`:

```ts
/**
 * The depth the sample deployment's rules would pick.
 *
 * Deterministic from the pull request's size rather than drawn, so the dev
 * dataset reads like a deployment that has these rules switched on — 11+
 * files deep, 28+ thorough — and the depth panel has every band to show.
 */
function seededDepth(changedFiles: number): { depth: ReviewDepth; reason: string } {
  if (changedFiles >= 28) {
    return { depth: "thorough", reason: `${changedFiles} files changed (rule: at least 28)` };
  }
  if (changedFiles >= 11) {
    return { depth: "deep", reason: `${changedFiles} files changed (rule: at least 11)` };
  }
  return { depth: "standard", reason: "deployment default" };
}
```

Change `buildReview`'s args to include `changedFiles: number;`, destructure it, and add these fields to the returned object after `recordId: ...`:

```ts
    depth: seededDepth(changedFiles).depth,
    depthReason: seededDepth(changedFiles).reason,
    passes: DEPTH_PASSES[seededDepth(changedFiles).depth],
    costUsd: null,
```

At the call site, change `buildReview({ prId, headSha, judgements, score, provider: "seed" })` to:

```ts
        buildReview({ prId, headSha, judgements, score, provider: "seed", changedFiles }),
```

- [ ] **Step 6: Run the store suite and confirm it passes**

Run: `pnpm -C packages/store exec vitest run && pnpm -C packages/store typecheck`
Expected: PASS. If an existing seed or easy-win test pinned a `changedFiles`-derived value, read it and update the pinned expectation, but only that expectation. The draw count is unchanged, so nothing else should move.

- [ ] **Step 7: Commit**

```bash
git add packages/store
git commit -m "feat(store): depth settings defaults and a seeded queue with real depth

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Ingest — the settings seam for depth

**Files:**
- Modify: `packages/ingest/src/settings.ts`
- Test: `packages/ingest/test/settings.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `packages/ingest/test/settings.test.ts`. Its imports already include `KomodoConfigSchema`, `DEFAULT_ORG_SETTINGS`, `applySettings` and `configToSettings`. Add these imports at the top:

```ts
import { DEPTH_PASSES as CORE_DEPTH_PASSES, REVIEW_DEPTHS } from "@komodo/core";
import { DEPTH_PASSES as STORE_DEPTH_PASSES, REVIEW_DEPTH_ORDER } from "@komodo/store";
```

Then:

```ts
describe("review depth", () => {
  it("hands the screen's default and rules to the reviewer", () => {
    const config = applySettings(
      baseConfig(),
      settings({
        reviewDepth: "deep",
        depthRules: [
          { kind: "files", value: "28", depth: "thorough" },
          { kind: "path", value: "migrations/**", depth: "thorough" },
          { kind: "label", value: "needs-deep-review", depth: "thorough" },
          { kind: "lines", value: "800", depth: "thorough" },
        ],
      }),
    );
    expect(config.depth).toEqual({
      default: "deep",
      rules: [
        { depth: "thorough", files: 28 },
        { depth: "thorough", path: "migrations/**" },
        { depth: "thorough", label: "needs-deep-review" },
        { depth: "thorough", lines: 800 },
      ],
    });
  });

  it("drops a rule no pull request could satisfy rather than handing it on", () => {
    const config = applySettings(
      baseConfig(),
      settings({
        depthRules: [
          { kind: "files", value: "0", depth: "deep" },
          { kind: "lines", value: "lots", depth: "deep" },
          { kind: "path", value: "  ", depth: "deep" },
        ],
      }),
    );
    expect(config.depth.rules).toEqual([]);
  });

  it("round-trips komodo.yaml's depth through the stored row", () => {
    const file = baseConfig({
      depth: {
        default: "deep",
        rules: [
          { files: 28, depth: "thorough" },
          { label: "risky", depth: "thorough" },
        ],
      },
    });
    const adopted = applySettings(baseConfig(), settings(configToSettings(file)));
    expect(adopted.depth).toEqual(file.depth);
  });

  it("keeps the store's depth tables in step with core's", () => {
    expect([...REVIEW_DEPTH_ORDER]).toEqual([...REVIEW_DEPTHS]);
    expect(STORE_DEPTH_PASSES).toEqual(CORE_DEPTH_PASSES);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm --filter @komodo/diagram --filter @komodo/core --filter @komodo/store build && pnpm -C packages/ingest exec vitest run test/settings.test.ts`
Expected: FAIL. `config.depth` stays at the file default.

- [ ] **Step 3: Implement the mapping (`packages/ingest/src/settings.ts`)**

Change the imports to:

```ts
import type { DepthRule, KomodoConfig, Severity } from "@komodo/core";
import { META_SETTINGS_INITIALIZED } from "@komodo/store";
import type { DepthRuleSetting, KomodoStore, OrgSettings } from "@komodo/store";
```

In `applySettings`'s returned object, add after `min_severity: ...,`:

```ts
    depth: {
      default: settings.reviewDepth,
      rules: settings.depthRules.flatMap(toConfigRule),
    },
```

In `configToSettings`'s returned object, add after `promptToFixWithAi: ...,`:

```ts
    reviewDepth: config.depth.default,
    depthRules: config.depth.rules.map(toSettingRule),
```

Add at the bottom of the file:

```ts
/**
 * A rule off the screen, in the shape komodo.yaml spells it.
 *
 * A number box holding "lots" or "0" is a rule nothing can satisfy. The
 * screen refuses to save one; this is the backstop, so a hand-edited row
 * can't hand the reviewer a condition that silently never matches.
 */
function toConfigRule(rule: DepthRuleSetting): DepthRule[] {
  const value = rule.value.trim();
  if (!value) return [];
  if (rule.kind === "files" || rule.kind === "lines") {
    if (!/^\d+$/.test(value) || Number(value) < 1) return [];
    const n = Number(value);
    return [rule.kind === "files" ? { depth: rule.depth, files: n } : { depth: rule.depth, lines: n }];
  }
  return [rule.kind === "path" ? { depth: rule.depth, path: value } : { depth: rule.depth, label: value }];
}

function toSettingRule(rule: DepthRule): DepthRuleSetting {
  if (rule.files !== undefined) return { kind: "files", value: String(rule.files), depth: rule.depth };
  if (rule.lines !== undefined) return { kind: "lines", value: String(rule.lines), depth: rule.depth };
  if (rule.path !== undefined) return { kind: "path", value: rule.path, depth: rule.depth };
  return { kind: "label", value: rule.label ?? "", depth: rule.depth };
}
```

- [ ] **Step 4: Run the ingest settings tests and confirm they pass**

Run: `pnpm --filter @komodo/diagram --filter @komodo/core --filter @komodo/store build && pnpm -C packages/ingest exec vitest run test/settings.test.ts`
Expected: PASS, including the existing "round-trips the defaults" test. If that test compares `configToSettings(defaults)` against a hand-written object, add `reviewDepth: "standard", depthRules: []` to its expected object.

- [ ] **Step 5: Commit**

```bash
git add packages/ingest/src/settings.ts packages/ingest/test/settings.test.ts
git commit -m "feat(ingest): the settings screen's depth reaches the reviewer

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Ingest — the job's depth reaches the run, and the run reaches the store

**Files:**
- Modify: `packages/ingest/src/map.ts` (`toReview`, line ~146)
- Modify: `packages/ingest/src/review.ts` (`reviewPending` and `reviewOne`)
- Test: `packages/ingest/test/map.test.ts`, `packages/ingest/test/review.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `packages/ingest/test/review.test.ts`:

```ts
describe("reviewPending — depth", () => {
  const result: ReviewResult = {
    summary: "- Adds a rate limiter.",
    walkthrough: [],
    confidence: 4,
    verdict: "Read the limiter and its tests.",
    effort: 2,
    verificationChecks: [],
    judgements: [],
  };

  it("runs the depth a person picked, and stores how hard it looked", async () => {
    let calls = 0;
    const provider: ReviewProvider = {
      name: "fake",
      async review() {
        calls++;
        return result;
      },
    };
    const github = {
      async getPR(ref: { owner: string; repo: string; number: number }) {
        return {
          ...ref, title: "Add rate limiting", body: "", author: "marco",
          url: "https://github.com/acme/api/pull/1", baseRef: "main", headRef: "limits",
          headSha: "aaa111", isDraft: false, labels: [],
        };
      },
      async listFiles() {
        return [{ path: "src/limit.ts", status: "modified", additions: 40, deletions: 3 }];
      },
    } as unknown as GitHubClient;

    const store = new SqliteStore({ path: ":memory:" });
    await store.upsertRepository({
      id: "acme/api", owner: "acme", name: "api", provider: "github", enabled: true, reviewCount: 0,
    });
    await store.upsertPullRequest(pr());
    await store.requestAIReview({
      prId: "acme/api#1", headSha: "aaa111", trigger: "manual",
      requestedBy: "renata", requestedAt: 1, depth: "thorough",
    });

    await reviewPending({ store, github, provider, config: config() });

    expect(calls).toBe(5);
    const detail = await store.loadLatestReview("acme/api#1");
    expect(detail?.review).toMatchObject({
      depth: "thorough", depthReason: "requested by renata", passes: 5,
    });
    store.close();
  });
});
```

Append to `packages/ingest/test/map.test.ts`, using that file's existing record fixture. If the fixture is a function, call it; adapt the name `record()` to whatever the file uses:

```ts
describe("toReview — depth", () => {
  it("carries how hard the run looked into the store", () => {
    const input = toReview("acme/api#1", {
      ...record(),
      run: { depth: "deep", depthReason: "labelled risky", passes: 2, costUsd: 0.2 },
    });
    expect(input).toMatchObject({ depth: "deep", depthReason: "labelled risky", passes: 2, costUsd: 0.2 });
  });

  it("reads a record without a run as one standard pass", () => {
    const { run: _run, ...legacy } = record();
    expect(toReview("acme/api#1", legacy)).toMatchObject({
      depth: "standard", depthReason: "", passes: 1, costUsd: null,
    });
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm --filter @komodo/diagram --filter @komodo/core --filter @komodo/store build && pnpm -C packages/ingest exec vitest run test/review.test.ts test/map.test.ts`
Expected: FAIL. Only one pass runs, and the stored depth is `standard`.

- [ ] **Step 3: `packages/ingest/src/map.ts`**

In `toReview`'s returned object, add after `recordId: record.id,`:

```ts
    // A record without `run` was written before depth existed, or pushed by
    // an older CLI. Either way it was one standard pass.
    depth: record.run?.depth ?? "standard",
    depthReason: record.run?.depthReason ?? "",
    passes: record.run?.passes ?? 1,
    costUsd: record.run?.costUsd ?? null,
```

- [ ] **Step 4: `packages/ingest/src/review.ts`**

Change `const outcome = await reviewOne(options, pr, repo);` in `reviewPending` to:

```ts
    const outcome = await reviewOne(
      options,
      pr,
      repo,
      job.depth ? { depth: job.depth, by: job.requestedBy } : null,
    );
```

Change `reviewOne`'s signature to:

```ts
async function reviewOne(
  options: ReviewRunnerOptions,
  pr: PullRequest,
  repo: Repository,
  depthRequest: DepthRequest | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
```

Add `type DepthRequest,` to the `from "@komodo/core"` import list, and pass it through in the `runReview({ ... })` call after `onProgress,`:

```ts
      depthRequest,
```

- [ ] **Step 5: Run the ingest suite and confirm it passes**

Run: `pnpm --filter @komodo/diagram --filter @komodo/core --filter @komodo/store build && pnpm -C packages/ingest exec vitest run && pnpm -C packages/ingest typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/ingest
git commit -m "feat(ingest): a requested depth reaches the run and the run's depth reaches the store

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: CLI — `komodo-review pr --depth`

**Files:**
- Modify: `packages/core/src/depth.ts` (add `parseDepth`)
- Modify: `packages/cli/src/index.ts` (the `pr` command, line 32)
- Modify: `packages/cli/src/commands/pr.ts`
- Test: `packages/core/test/depth.test.ts` (append; the CLI has no test runner)

- [ ] **Step 1: Write the failing test**

Add `parseDepth` to the existing `../src/depth.js` import at the top of `packages/core/test/depth.test.ts`, then append:

```ts
describe("parseDepth", () => {
  it("accepts a depth name, case-insensitively", () => {
    expect(parseDepth("Thorough")).toBe("thorough");
  });

  it("names the choices when it refuses", () => {
    expect(() => parseDepth("max")).toThrow("standard, deep or thorough");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm -C packages/core exec vitest run test/depth.test.ts`
Expected: FAIL. `parseDepth` is not exported.

- [ ] **Step 3: Add `parseDepth` to `packages/core/src/depth.ts`**

```ts
/** A depth from a flag or a form field, refused with the choices spelled out. */
export function parseDepth(value: string): ReviewDepth {
  const depth = value.trim().toLowerCase();
  if ((REVIEW_DEPTHS as readonly string[]).includes(depth)) return depth as ReviewDepth;
  throw new Error(`Unknown review depth "${value}". Use standard, deep or thorough.`);
}
```

- [ ] **Step 4: Wire the flag**

In `packages/cli/src/index.ts`, in the `pr` command, add after `.option("--model <model>", ...)`:

```ts
  .option("--depth <depth>", "standard | deep | thorough (default: the depth rules in komodo.yaml)")
```

In `packages/cli/src/commands/pr.ts`, add `parseDepth` and `DEPTH_PASSES` to the `@komodo/core` import. Change the `opts` type to `{ localOnly: boolean; provider?: string; model?: string; depth?: string }`. Add after `const provider = createProvider(config, opts.provider);`:

```ts
  // Parsed before any work starts, so a typo costs nothing.
  const depth = opts.depth ? parseDepth(opts.depth) : null;
```

Add to the `runReview({ ... })` call, after `model: config.model,`:

```ts
    depthRequest: depth ? { depth } : null,
```

After the line that prints the confidence row (`console.log(\`${"🟩".repeat(...)}...\`)`), add:

```ts
  const run = outcome.record.run;
  if (run) {
    const planned = DEPTH_PASSES[run.depth];
    console.log(
      pc.dim(
        `  ${run.depth} · ${run.passes === planned ? run.passes : `${run.passes} of ${planned}`} pass${planned === 1 ? "" : "es"} — ${run.depthReason}` +
          (run.costUsd !== null ? ` · $${run.costUsd.toFixed(2)} reported` : ""),
      ),
    );
  }
```

- [ ] **Step 5: Verify**

Run: `pnpm -C packages/core exec vitest run test/depth.test.ts && pnpm --filter @komodo/core build && pnpm -C packages/cli typecheck`
Expected: PASS, and typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/depth.ts packages/core/test/depth.test.ts packages/cli/src/index.ts packages/cli/src/commands/pr.ts
git commit -m "feat(cli): komodo-review pr --depth

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: `komodo-review eval` against seeded bugs

**Files:**
- Create: `packages/core/src/eval.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/cli/src/commands/eval.ts`
- Modify: `packages/cli/src/index.ts`
- Create: `eval/playground.yaml`
- Test: `packages/core/test/eval.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/eval.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { EvalFileSchema, scoreCase } from "../src/eval.js";
import type { Judgement } from "../src/schema.js";

const j = (over: Partial<Judgement>) =>
  ({
    path: "src/db.js", line: 16, focus: "code", severity: "critical",
    title: "Search interpolates the name into SQL.", lede: "An attacker can inject SQL.",
    detail: "Use a parameter.", ...over,
  }) as Judgement;

const expectations = EvalFileSchema.parse({
  cases: [
    {
      pr: "Delavalom/komodo-playground#1",
      expect: [
        { name: "SQL injection", path: "src/db.js", lines: [14, 18], match: "inject|interpolat" },
        { name: "race", path: "src/wallet.js", match: "race|concurren" },
      ],
    },
  ],
}).cases[0].expect;

describe("scoreCase", () => {
  it("counts an expectation hit when path, line range and wording all match", () => {
    const score = scoreCase([j({})], expectations);
    expect(score.hits.map((h) => h.name)).toEqual(["SQL injection"]);
    expect(score.missed.map((m) => m.name)).toEqual(["race"]);
  });

  it("does not count a judgement outside the line range", () => {
    expect(scoreCase([j({ line: 40 })], expectations).hits).toEqual([]);
  });

  it("matches wording case-insensitively across title, lede and detail", () => {
    const hit = j({ path: "src/wallet.js", line: 12, title: "Balances can be lost.", lede: "A RACE between reads." });
    expect(scoreCase([hit], expectations).hits.map((h) => h.name)).toEqual(["race"]);
  });

  it("refuses a case with no expectations", () => {
    expect(() => EvalFileSchema.parse({ cases: [{ pr: "a/b#1", expect: [] }] })).toThrow();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm -C packages/core exec vitest run test/eval.test.ts`
Expected: FAIL with `Cannot find module '../src/eval.js'`.

- [ ] **Step 3: Create `packages/core/src/eval.ts`**

```ts
import { z } from "zod";

import { REVIEW_DEPTHS } from "./depth.js";
import type { Judgement } from "./schema.js";

/**
 * A known defect a review of this pull request should raise.
 *
 * Scored against judgements, not against wording alone: the path has to
 * match, the line has to fall in range when one is given, and `match` — a
 * case-insensitive regular expression — has to find the idea somewhere in
 * the title, lede or detail.
 */
export const EvalExpectationSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  lines: z.tuple([z.number().int().min(0), z.number().int().min(0)]).optional(),
  match: z.string().min(1),
});
export type EvalExpectation = z.infer<typeof EvalExpectationSchema>;

export const EvalFileSchema = z.object({
  /** Depths to compare. Defaults to all three. */
  depths: z.array(z.enum(REVIEW_DEPTHS)).min(1).default([...REVIEW_DEPTHS]),
  cases: z
    .array(
      z.object({
        /** owner/repo#number, as `komodo-review pr` takes it. */
        pr: z.string().min(1),
        expect: z.array(EvalExpectationSchema).min(1),
      }),
    )
    .min(1),
});
export type EvalFile = z.infer<typeof EvalFileSchema>;

export interface CaseScore {
  hits: EvalExpectation[];
  missed: EvalExpectation[];
}

export function scoreCase(judgements: Judgement[], expectations: EvalExpectation[]): CaseScore {
  const hits: EvalExpectation[] = [];
  const missed: EvalExpectation[] = [];
  for (const want of expectations) {
    const pattern = new RegExp(want.match, "i");
    const found = judgements.some(
      (j) =>
        j.path === want.path &&
        (!want.lines || (j.line >= want.lines[0] && j.line <= want.lines[1])) &&
        pattern.test(`${j.title}\n${j.lede}\n${j.detail}`),
    );
    (found ? hits : missed).push(want);
  }
  return { hits, missed };
}
```

In `packages/core/src/index.ts` add:

```ts
export * from "./eval.js";
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm -C packages/core exec vitest run test/eval.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Create the fixture `eval/playground.yaml`**

The line ranges come from the diff of `Delavalom/komodo-playground#1`: `searchUsers` sits at db.js 13–18, `pageCount` and `lastItemIndexOnPage` at pagination.js 9–15, and `credit`/`transfer` at wallet.js 10–22.

```yaml
# Seeded defects Komodo should raise, one pull request per case.
# Run: komodo-review eval eval/playground.yaml
# Every case is a real model run per depth — this spends quota on purpose.
depths: [standard, deep, thorough]
cases:
  - pr: Delavalom/komodo-playground#1
    expect:
      - name: searchUsers builds SQL by string interpolation
        path: src/db.js
        lines: [13, 18]
        match: "inject|interpolat|parameteri|escap"
      - name: pageCount drops a final partial page
        path: src/pagination.js
        lines: [9, 11]
        match: "floor|ceil|partial|last page|round"
      - name: lastItemIndexOnPage is one past the end
        path: src/pagination.js
        lines: [13, 15]
        match: "off.by.one|one past|exclusive|inclusive|- ?1"
      - name: credit and transfer race on the balance
        path: src/wallet.js
        lines: [10, 22]
        match: "race|concurren|interleav|stale|read.modify|atomic|lost update"
```

- [ ] **Step 6: Create `packages/cli/src/commands/eval.ts`**

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pc from "picocolors";
import { parse } from "yaml";

import {
  createProvider,
  DEPTH_PASSES,
  EvalFileSchema,
  GitHubClient,
  loadConfig,
  parsePRRef,
  runReview,
  scoreCase,
} from "@komodo/core";

/**
 * Runs each case at each depth and reports which expected defects were raised.
 *
 * Never posts, never writes to the queue: this measures the reviewer, it does
 * not review anything anyone is waiting on. Every row is a real model run.
 */
export async function evalCommand(
  file: string,
  opts: { provider?: string; model?: string },
): Promise<void> {
  const spec = EvalFileSchema.parse(parse(readFileSync(resolve(file), "utf8")));
  const { config } = loadConfig();
  if (opts.model) config.model = opts.model;
  const provider = createProvider(config, opts.provider);
  const github = new GitHubClient();

  const rows: string[][] = [["case", "depth", "found", "judgements", "passes", "cost", "seconds"]];
  for (const testCase of spec.cases) {
    for (const depth of spec.depths) {
      console.log(pc.dim(`• ${testCase.pr} at ${depth}…`));
      const started = Date.now();
      const outcome = await runReview({
        ref: parsePRRef(testCase.pr),
        provider,
        config,
        github,
        post: false,
        depthRequest: { depth, by: "eval" },
        model: config.model,
      });
      const judgements = [...outcome.record.result.judgements, ...outcome.droppedJudgements];
      const score = scoreCase(judgements, testCase.expect);
      const run = outcome.record.run;
      rows.push([
        testCase.pr,
        depth,
        `${score.hits.length}/${testCase.expect.length}`,
        String(judgements.length),
        `${run?.passes ?? 1}/${DEPTH_PASSES[depth]}`,
        run?.costUsd != null ? `$${run.costUsd.toFixed(2)}` : "—",
        ((Date.now() - started) / 1000).toFixed(0),
      ]);
      for (const missed of score.missed) console.log(pc.yellow(`    missed: ${missed.name}`));
    }
  }

  const widths = rows[0].map((_, col) => Math.max(...rows.map((r) => r[col].length)));
  console.log("");
  for (const row of rows) console.log(row.map((cell, col) => cell.padEnd(widths[col])).join("  "));
}
```

Note that the CLI's `runReview` call doesn't set `repoDir`, so eval runs see the diff only, unless the caller is inside a clone. That is the same as `komodo-review pr` outside a clone. Mention it in the doc in Task 20.

- [ ] **Step 7: Register the command in `packages/cli/src/index.ts`**

Add the import `import { evalCommand } from "./commands/eval.js";` and register it after the `pr` command:

```ts
program
  .command("eval")
  .argument("<file>", "eval YAML, e.g. eval/playground.yaml")
  .description("Run seeded pull requests at each review depth and report which known defects were raised")
  .option("--provider <name>", "claude | codex (default: from komodo.yaml / auto-detect)")
  .option("--model <model>", "model override passed to the provider")
  .action(evalCommand);
```

- [ ] **Step 8: Verify**

Run: `pnpm -C packages/core exec vitest run && pnpm --filter @komodo/diagram --filter @komodo/core --filter @komodo/store build && pnpm -C packages/cli typecheck && pnpm -C packages/cli build`
Expected: PASS and a clean build. **Don't** run the eval itself here. It spends real quota, and Task 21 runs it once on purpose.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/eval.ts packages/core/src/index.ts packages/core/test/eval.test.ts packages/cli/src/commands/eval.ts packages/cli/src/index.ts eval/playground.yaml
git commit -m "feat(cli): komodo-review eval measures each depth against seeded defects

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Task 16: Web — "Review with AI" takes a depth

**Files:**
- Modify: `apps/web/src/lib/data/actions.ts` (`requestAIReview`, line 119)
- Modify: `apps/web/src/lib/types.ts` (re-exports)
- Create: `apps/web/src/components/review/request-review-button.tsx`
- Modify: `apps/web/src/components/queue/view.tsx` (lines ~327 and ~425–436)
- Modify: `apps/web/src/components/review/header.tsx` (lines ~202–225)

The web app has no unit-test runner. It is verified by typecheck, lint, build and Task 21's live check (rule 10).

- [ ] **Step 1: Re-export the store types**

In `apps/web/src/lib/types.ts`, add `DepthRuleSetting`, `ReviewDepth` and `ReviewRunOutcome` to the `export type { ... } from "@komodo/store"` list, keeping it alphabetical. Also add `ReviewDepth` to the local `import type { ... } from "@komodo/store"` block below it.

- [ ] **Step 2: Accept and validate the depth in the server action**

In `apps/web/src/lib/data/actions.ts`, add `DEPTH_PASSES` to an import from `@komodo/store` (add the import if the file has none), and `ReviewDepth` to the types imported from `@/lib/types`. Replace `requestAIReview` with:

```ts
/** Queue one immutable current head for the local or interactive worker. */
export async function requestAIReview(
  prId: string,
  expectedHeadSha: string,
  depth: ReviewDepth | null = null,
): Promise<void> {
  // A server action is an endpoint: the menu only offers three values, and
  // nothing stops a request carrying a fourth.
  if (depth !== null && !(depth in DEPTH_PASSES)) {
    throw new Error("That is not a review depth.");
  }
  const store = await getStore();
  const snapshot = await store.snapshot();
  const pr = snapshot.pullRequests.find((candidate) => candidate.id === prId);
  if (!pr || pr.state !== "open") {
    throw new Error("That pull request is no longer open.");
  }
  if (pr.headSha !== expectedHeadSha) {
    throw new Error("The pull request changed. Reload before requesting a review.");
  }

  await store.requestAIReview({
    prId,
    headSha: pr.headSha,
    trigger: "manual",
    requestedBy: await resolveActorLogin(snapshot.members),
    requestedAt: Date.now(),
    depth,
  });
  // An explicit retry means the operator believes the provider is usable
  // again; do not leave it behind the automatic failure circuit.
  await store.setMeta("review.providerPausedUntil", "0");
  revalidatePath("/", "layout");
}
```

- [ ] **Step 3: Create `apps/web/src/components/review/request-review-button.tsx`**

```tsx
"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { DEPTH_LABEL, DEPTH_PASSES, REVIEW_DEPTH_ORDER } from "@komodo/store";

import { Button } from "@/components/ui/button";
import { Popover, PopoverHeading, PopoverItem } from "@/components/ui/controls";
import { useRequestAIReview } from "@/lib/data/mutations";
import type { ReviewDepth } from "@/lib/types";

const DEPTH_HINT: Record<ReviewDepth, string> = {
  standard: "One pass over the diff and the code it touches.",
  deep: "A second pass looks for what the first one missed.",
  thorough: "Architecture, scope and tests get a pass each, then a second look.",
};

/**
 * Review with AI, at a depth.
 *
 * The main button leaves the depth to the rules under Settings → Review. The
 * menu beside it picks one for this run only, overriding those rules in
 * either direction. Each entry says how many passes it spends, because that
 * is what it costs.
 */
export function RequestReviewButton({
  prId,
  headSha,
  label,
}: {
  prId: string;
  headSha: string;
  label: string;
}) {
  const request = useRequestAIReview();
  const [requesting, startRequest] = React.useTransition();
  const [open, setOpen] = React.useState(false);

  function ask(depth: ReviewDepth | null) {
    setOpen(false);
    startRequest(() => request(prId, headSha, depth));
  }

  return (
    <div className="flex items-center">
      <Button variant="ghost" size="sm" disabled={requesting} onClick={() => ask(null)}>
        {requesting ? "Queuing…" : label}
      </Button>
      <Popover
        open={open}
        onOpenChange={setOpen}
        align="end"
        panelClassName="w-[300px]"
        trigger={({ toggle }) => (
          <Button
            variant="ghost"
            size="sm"
            disabled={requesting}
            aria-label="Choose how deep this review looks"
            onClick={toggle}
            className="px-1.5"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        )}
      >
        <PopoverHeading>Review depth for this run</PopoverHeading>
        {REVIEW_DEPTH_ORDER.map((depth) => (
          <PopoverItem key={depth} onClick={() => ask(depth)}>
            <span className="min-w-0">
              <span className="block">{DEPTH_LABEL[depth]}</span>
              <span className="block text-xs text-muted-foreground">{DEPTH_HINT[depth]}</span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {DEPTH_PASSES[depth]} {DEPTH_PASSES[depth] === 1 ? "pass" : "passes"}
            </span>
          </PopoverItem>
        ))}
      </Popover>
    </div>
  );
}
```

- [ ] **Step 4: Use it in the queue row (`apps/web/src/components/queue/view.tsx`)**

Replace the block

```tsx
            {canRequestAiReview(row.aiState) ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={requesting}
                onClick={() =>
                  startRequest(() => requestAIReview(row.id, row.headSha))
                }
              >
                {requesting ? "Queuing…" : "Review with AI"}
              </Button>
            ) : null}
```

with

```tsx
            {canRequestAiReview(row.aiState) ? (
              <RequestReviewButton prId={row.id} headSha={row.headSha} label="Review with AI" />
            ) : null}
```

Add `import { RequestReviewButton } from "@/components/review/request-review-button";`. In `QueueRowCells`, delete `const requestAIReview = useRequestAIReview();` and `const [requesting, startRequest] = React.useTransition();` if nothing else in the component uses them; `pnpm -C apps/web lint` will flag them if they're unused. Remove the `useRequestAIReview` import if it's now unused.

- [ ] **Step 5: Use it in the PR header (`apps/web/src/components/review/header.tsx`)**

Replace `<AskAIReviewButton prId={pr.id} headSha={pr.headSha} />` with

```tsx
          <RequestReviewButton prId={pr.id} headSha={pr.headSha} label="Ask AI review" />
```

Delete the now-unused `AskAIReviewButton` function, add the `RequestReviewButton` import, and remove `useRequestAIReview` from the imports if it's no longer used.

- [ ] **Step 6: Verify**

Run: `pnpm --filter @komodo/diagram --filter @komodo/core --filter @komodo/store build && pnpm -C apps/web typecheck && pnpm -C apps/web lint`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat(web): pick a review depth from Review with AI

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Task 17: Web — settings screen controls for depth (rule 3's other half)

**Files:**
- Create: `apps/web/src/components/settings/review-depth-section.tsx`
- Modify: `apps/web/src/components/settings/review-view.tsx` (insert before the `{/* ── PR Summaries ── */}` comment, line ~207)
- Modify: `apps/web/src/components/settings/sidebar.tsx` (children of "Code Review", line ~58)

- [ ] **Step 1: Create the section**

`apps/web/src/components/settings/review-depth-section.tsx`:

```tsx
"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { DEPTH_LABEL, DEPTH_PASSES, REVIEW_DEPTH_ORDER } from "@komodo/store";

import { Button } from "@/components/ui/button";
import { Card, SectionHeading, SettingRow } from "@/components/ui/card";
import { Segmented, Select } from "@/components/ui/controls";
import { Input } from "@/components/ui/input";
import { useOrgSettings } from "@/lib/data/queries";
import { useUpdateOrgSettings } from "@/lib/data/mutations";
import type { DepthRuleSetting, ReviewDepth } from "@/lib/types";

type RuleKind = DepthRuleSetting["kind"];

const RULE_KINDS: readonly RuleKind[] = ["files", "lines", "path", "label"];

const RULE_KIND_LABEL: Record<RuleKind, string> = {
  files: "Changed files at least",
  lines: "Changed lines at least",
  path: "Touches a path matching",
  label: "Has the label",
};

const RULE_PLACEHOLDER: Record<RuleKind, string> = {
  files: "28",
  lines: "800",
  path: "migrations/**",
  label: "needs-deep-review",
};

/** Why a draft rule can't be saved yet, or null when it can. */
function ruleProblem(kind: RuleKind, value: string): string | null {
  const v = value.trim();
  if (!v) return "Enter a value.";
  if ((kind === "files" || kind === "lines") && !(/^\d+$/.test(v) && Number(v) >= 1)) {
    return "Enter a whole number, 1 or more.";
  }
  return null;
}

/**
 * Settings → Review → Review Depth.
 *
 * Both fields here are read by packages/ingest/src/settings.ts and handed to
 * the reviewer as `config.depth` — see AGENTS.md rule 3. Rules are added
 * whole and removed whole rather than edited in place, so nothing is saved
 * on a keystroke and a half-typed number never reaches the reviewer.
 */
export function ReviewDepthSection() {
  const settings = useOrgSettings();
  const update = useUpdateOrgSettings();
  const [kind, setKind] = React.useState<RuleKind>("files");
  const [value, setValue] = React.useState("");
  const [depth, setDepth] = React.useState<ReviewDepth>("thorough");
  const problem = ruleProblem(kind, value);

  function addRule() {
    if (problem) return;
    update({ depthRules: [...settings.depthRules, { kind, value: value.trim(), depth }] });
    setValue("");
  }

  return (
    <section className="space-y-4">
      <SectionHeading
        id="review-depth"
        title="Review Depth"
        subtitle="How many passes a review makes, and when it makes more"
      />
      <SettingRow
        title="Default depth"
        description="Standard is one pass. Deep adds a second look for what the first missed. Thorough gives architecture, scope and tests a pass each, then a second look. Each pass is one credit."
        control={
          <Segmented
            value={settings.reviewDepth}
            onChange={(reviewDepth) => update({ reviewDepth })}
            options={REVIEW_DEPTH_ORDER.map((d) => ({
              value: d,
              label: `${DEPTH_LABEL[d]} · ${DEPTH_PASSES[d]}`,
            }))}
          />
        }
      />
      <Card className="p-5">
        <div className="text-base font-medium">Go deeper when</div>
        <p className="mt-1 text-sm text-muted-foreground">
          The deepest matching rule wins. No rule takes a review below the
          default, and a depth picked from the Review with AI menu overrides
          all of them for that run. Files and lines are counted after path
          filters, so lockfiles and build output don&apos;t count.
        </p>
        <div className="mt-4 space-y-2">
          {settings.depthRules.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No rules yet. Every review runs at the default depth.
            </p>
          ) : null}
          {settings.depthRules.map((rule, index) => (
            <div
              key={`${rule.kind}:${rule.value}:${index}`}
              className="flex items-center justify-between gap-3 rounded-[2px] border border-border bg-secondary px-3 py-2 text-sm"
            >
              <span>
                {RULE_KIND_LABEL[rule.kind]}{" "}
                <span className="font-mono">{rule.value}</span> →{" "}
                {DEPTH_LABEL[rule.depth]}
              </span>
              <Button
                variant="ghost"
                aria-label={`Remove the rule: ${RULE_KIND_LABEL[rule.kind]} ${rule.value}`}
                onClick={() =>
                  update({ depthRules: settings.depthRules.filter((_, i) => i !== index) })
                }
                className="h-8 w-8 p-0"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Select
            size="md"
            className="w-[220px]"
            value={kind}
            onChange={setKind}
            options={RULE_KINDS.map((k) => ({ value: k, label: RULE_KIND_LABEL[k] }))}
          />
          <Input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addRule();
              }
            }}
            placeholder={RULE_PLACEHOLDER[kind]}
            aria-label="Rule value"
            className="w-[200px]"
          />
          <Select
            size="md"
            className="w-[140px]"
            value={depth}
            onChange={setDepth}
            options={REVIEW_DEPTH_ORDER.map((d) => ({ value: d, label: DEPTH_LABEL[d] }))}
          />
          <Button onClick={addRule} disabled={Boolean(problem)}>
            Add rule
          </Button>
        </div>
        {value && problem ? (
          <p className="mt-2 text-sm text-[hsl(var(--error))]">{problem}</p>
        ) : null}
      </Card>
    </section>
  );
}
```

- [ ] **Step 2: Mount it**

In `apps/web/src/components/settings/review-view.tsx`, import `ReviewDepthSection` from `./review-depth-section` and insert it directly before `{/* ── PR Summaries ──...── */}`:

```tsx
      <ReviewDepthSection />

```

- [ ] **Step 3: Link it from the sidebar**

In `apps/web/src/components/settings/sidebar.tsx`, add `Layers` to the `lucide-react` import, and add this child after the `when-reviews` entry:

```tsx
            {
              href: `${base}/review#review-depth`,
              label: "Review Depth",
              icon: <Layers className="h-4 w-4" />,
            },
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter @komodo/diagram --filter @komodo/core --filter @komodo/store build && pnpm -C apps/web typecheck && pnpm -C apps/web lint`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/settings
git commit -m "feat(web): settings controls for the default depth and depth rules

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Task 18: Web — the review page says how hard the run looked

**Files:**
- Modify: `apps/web/src/components/review/whole.tsx` (the run footer, lines ~164–167)

- [ ] **Step 1: Change the footer**

Add `import { describeDepth } from "@komodo/store";`. Replace

```tsx
        <p className="mt-8 text-xs text-muted-foreground">
          Run {review.id} · {review.provider}
          {review.model ? ` · ${review.model}` : ""} · head{" "}
          <span className="font-mono">{review.headSha.slice(0, 7)}</span>
        </p>
```

with

```tsx
        <p className="mt-8 text-xs text-muted-foreground">
          Run {review.id} · {review.provider}
          {review.model ? ` · ${review.model}` : ""} · {describeDepth(review)}
          {review.costUsd !== null ? ` · $${review.costUsd.toFixed(2)} reported by the provider` : ""}
          {" "}· head <span className="font-mono">{review.headSha.slice(0, 7)}</span>
        </p>
```

- [ ] **Step 2: Verify and commit**

```bash
pnpm --filter @komodo/diagram --filter @komodo/core --filter @komodo/store build && pnpm -C apps/web typecheck && pnpm -C apps/web lint
git add apps/web/src/components/review/whole.tsx
git commit -m "feat(web): the review page names the run's depth, passes and reason

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Task 19: Web — depth outcomes on analytics; credits as passes on usage

**Files:**
- Modify: `apps/web/src/lib/data/queries.ts` (add hooks after `useLeaderboards`; replace `useUsageDays`, line ~1193)
- Modify: `apps/web/src/components/analytics/view.tsx` (`ReviewsTab`)
- Modify: `apps/web/src/components/settings/usage-view.tsx`

- [ ] **Step 1: Add the hooks to `apps/web/src/lib/data/queries.ts`**

Add `summarizeDepthOutcomes` to an import from `@komodo/store`, and add `ReviewRunOutcome` to the types imported from `@/lib/types`. Add after `useLeaderboards`:

```ts
/* ── Analytics: review depth ───────────────────────────────────────────── */

/**
 * Runs inside the analytics scope, by when the run happened rather than when
 * its pull request last moved — a run is the event being measured.
 */
function useScopedRuns(query: AnalyticsQuery): ReviewRunOutcome[] {
  const runs = useSnapshot().reviewRuns;
  const repoIndex = useRepoIndex();
  const { from, to } = timeframeWindow(query.timeframe, useNow());
  const repos = query.repos;
  const authors = query.authors;

  return useMemo(() => {
    const repoAllow = repos?.length ? new Set(repos) : null;
    const authorAllow = authors?.length ? new Set(authors) : null;
    return runs.filter((run) => {
      if (run.createdAt < from || run.createdAt > to) return false;
      if (authorAllow && !authorAllow.has(run.author)) return false;
      if (repoAllow) {
        const repo = repoIndex.get(run.repoId);
        if (!repo || !repoAllow.has(fullName(repo))) return false;
      }
      return true;
    });
  }, [runs, repoIndex, from, to, repos, authors]);
}

/** Upheld critical and major judgements per run, by PR size and depth. */
export function useDepthOutcomes(query: AnalyticsQuery) {
  const runs = useScopedRuns(query);
  return useMemo(() => summarizeDepthOutcomes(runs), [runs]);
}
```

Replace `useUsageDays` entirely:

```ts
/**
 * Review volume and credits, day by day.
 *
 * Counted from review runs. A credit is one model pass that returned, so a
 * thorough run that lost a lens costs four, not five. A deployment on its own
 * subscription has no invoice to show; what it has is passes, and those are
 * real.
 */
export function useUsageDays(): UsageDay[] {
  const runs = useSnapshot().reviewRuns;
  const { from, to } = useUsageWindow();

  return useMemo(() => {
    const byDay = new Map<number, { runs: number; passes: number }>();
    for (const run of runs) {
      const day = startOfDay(run.createdAt);
      if (day < from || day > to) continue;
      const row = byDay.get(day) ?? { runs: 0, passes: 0 };
      row.runs++;
      row.passes += run.passes;
      byDay.set(day, row);
    }

    const out: UsageDay[] = [];
    for (let d = from; d <= to; d += DAY_MS) {
      const row = byDay.get(d) ?? { runs: 0, passes: 0 };
      out.push({
        date: d,
        reviews: row.runs,
        codeReviewCredits: row.passes,
        // A run started from a laptop lands in the same store through the same
        // port, and nothing distinguishes it from one the poller started. Until
        // a run records where it came from, this cannot honestly be anything
        // but zero.
        cliCredits: 0,
      });
    }
    return out;
  }, [runs, from, to]);
}

/** Credits by pull request author, over the usage window. */
export function useCreditsByAuthor(): Map<string, number> {
  const runs = useSnapshot().reviewRuns;
  const { from, to } = useUsageWindow();
  return useMemo(() => {
    const out = new Map<string, number>();
    for (const run of runs) {
      const day = startOfDay(run.createdAt);
      if (day < from || day > to) continue;
      out.set(run.author, (out.get(run.author) ?? 0) + run.passes);
    }
    return out;
  }, [runs, from, to]);
}

/**
 * What providers said the window's runs cost, in USD. Null when no run in the
 * window reported one — Codex never does — so the screen can say nothing
 * rather than show a zero nobody measured.
 */
export function useUsageCost(): number | null {
  const runs = useSnapshot().reviewRuns;
  const { from, to } = useUsageWindow();
  return useMemo(() => {
    let total: number | null = null;
    for (const run of runs) {
      const day = startOfDay(run.createdAt);
      if (day < from || day > to || run.costUsd === null) continue;
      total = (total ?? 0) + run.costUsd;
    }
    return total;
  }, [runs, from, to]);
}
```

- [ ] **Step 2: Add the panel to analytics (`apps/web/src/components/analytics/view.tsx`)**

Add `Layers` to the `lucide-react` import, `useDepthOutcomes` to the `@/lib/data/queries` import, and:

```tsx
import { DEPTH_LABEL, REVIEW_DEPTH_ORDER, SIZE_BANDS } from "@komodo/store";
```

In `ReviewsTab`, add `const depthOutcomes = useDepthOutcomes(query);` with the other hooks. Add this as the **last child** of the `<div className="mt-6 space-y-6">` that `ReviewsTab` returns:

```tsx
      <Panel
        icon={<Layers className="h-4 w-4" />}
        title="What deeper reviews found"
        hint="Critical and major judgements a person answered Blocks or Agreed, per review run, by pull request size. A dash means no run at that depth and size yet, not zero."
      >
        <DataTable>
          <THead>
            <tr>
              <TH>Pull request size</TH>
              {REVIEW_DEPTH_ORDER.map((depth) => (
                <TH key={depth}>{DEPTH_LABEL[depth]}</TH>
              ))}
            </tr>
          </THead>
          <tbody>
            {SIZE_BANDS.map((band) => (
              <TR key={band.key}>
                <TD>{band.label}</TD>
                {REVIEW_DEPTH_ORDER.map((depth) => {
                  const cell = depthOutcomes[band.key][depth];
                  return (
                    <TD key={depth}>
                      {cell.severeUpheldPerRun === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <>
                          {cell.severeUpheldPerRun.toFixed(2)}
                          <span className="text-muted-foreground">
                            {" "}per run · {cell.runs} {cell.runs === 1 ? "run" : "runs"}
                          </span>
                        </>
                      )}
                    </TD>
                  );
                })}
              </TR>
            ))}
          </tbody>
        </DataTable>
      </Panel>
```

- [ ] **Step 3: Usage screen (`apps/web/src/components/settings/usage-view.tsx`)**

Change the queries import to `import { useCreditsByAuthor, useMembers, useUsageCost, useUsageDays, useUsageWindow } from "@/lib/data/queries";`. In `UsageView`, add:

```tsx
  const creditsByAuthor = useCreditsByAuthor();
  const reportedCost = useUsageCost();
```

Delete `const creditsByDeveloper = totals[0].credits;`. It gave every developer the whole team's total. In the developer table, replace `<TD>{creditsByDeveloper}</TD>` with:

```tsx
                <TD>{creditsByAuthor.get(member.githubLogin) ?? 0}</TD>
```

In the summary table header, replace the Credits `<th>` content `Credits` with:

```tsx
                  <span className="inline-flex items-center gap-1.5">
                    Credits
                    <InfoHint>
                      One credit is one model pass: standard reviews take 1,
                      deep 2, thorough 5. A pass that failed costs nothing.
                    </InfoHint>
                  </span>
```

Directly after the closing `</table>` of that summary table, still inside its `<div className="border-t border-border">`, add:

```tsx
          {reportedCost !== null ? (
            <p className="border-t border-border px-5 py-2.5 text-sm text-muted-foreground">
              Providers reported ${reportedCost.toFixed(2)} for this window&apos;s runs.
            </p>
          ) : null}
```

- [ ] **Step 4: Verify and commit**

```bash
pnpm --filter @komodo/diagram --filter @komodo/core --filter @komodo/store build && pnpm -C apps/web typecheck && pnpm -C apps/web lint
git add apps/web
git commit -m "feat(web): depth outcomes on analytics; usage counts credits as passes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Task 20: Docs and config examples

**Files:**
- Create: `docs/architecture/review-depth.md`
- Modify: `komodo.yaml` (after the commented `auto_review:` block)
- Modify: `packages/cli/komodo.yaml`. Open it first; if it carries the same commented `auto_review:` block, add the same snippet after it.

- [ ] **Step 1: Write `docs/architecture/review-depth.md`**

```markdown
# Review depth

A review can spend more when a pull request warrants it. There are three depths:

| Depth | Passes | What the extra passes do |
|---|---|---|
| Standard | 1 | — the review Komodo always ran |
| Deep | 2 | A second look, handed everything already raised and asked only for what is missing |
| Thorough | 5 | Architecture, scope and tests get a pass each, in parallel with the base pass; then the second look |

A credit is one pass that returned. An extra pass that fails is left out and
the run carries on; the review page then says "4 of 5 passes". A failed base
pass fails the run, as it always did.

Depth buys a better brief, not a verdict. The extra passes look for
architectural fit, scope and test adequacy, plus results a person must observe
(AGENTS.md rule 15). None of it is evidence that the change works.

## Who decides

1. **A person**, from the menu beside Review with AI. This wins outright, in either direction.
2. **Rules**, under Settings → Review → Review Depth, or `depth.rules` in
   komodo.yaml. Each rule has exactly one condition: changed files, changed
   lines, a path glob, or a label. The deepest matching rule wins. Files and
   lines are counted after path filters.
3. **The default**, `depth.default`. No rule can go below it.

The decision and its reason (`requested by renata`, `31 files changed (rule: at
least 28)`, `deployment default`) are stored on the run.

## How it flows

`resolveDepth` (packages/core/src/depth-rules.ts) → `runPasses`
(packages/core/src/passes.ts) → `mergeResults` (packages/core/src/merge.ts) →
`ReviewRecord.run` → `reviews.depth / depthReason / passes / costUsd`. A
requested depth rides on `ai_review_jobs.depth` from the button to the worker.

Merging is deterministic. Judgements with the same focus in the same file
within three lines, or cross-cutting judgements with the same title, are one
concern, and the more severe reading stays. Verification checks are deduped by
title. Only the base pass writes the summary, walkthrough and scores.

## Did it help?

Analytics → PR Reviews → *What deeper reviews found* shows, for each PR size
and depth, the critical and major judgements a person **upheld** (newest
answer Blocks or Agreed) per run. It is derived from the answer ledger at read
time, so a depth that only adds noise does not score better.

`komodo-review eval eval/playground.yaml` runs seeded pull requests at each
depth and reports which known defects were raised. It spends real quota, never
posts, and never writes to the queue. Run it from a clone of the target
repository to give the passes a working tree; elsewhere they see the diff only.

## Not covered

Interactive claims (`komodo-review claim` / `submit`) record standard depth.
Komodo cannot observe how many passes a person's own agent made, and it does
not record a number it did not observe.
```

- [ ] **Step 2: Add the commented example to `komodo.yaml`**

Insert after the commented `auto_review:` block, before `post:`:

```yaml
# How hard a review looks. Standard is one pass; deep adds a second look for
# what the first missed; thorough gives architecture, scope and tests a pass
# each, then a second look. One pass is one credit. The deepest matching rule
# wins, no rule goes below `default`, and a depth picked from the Review with
# AI menu overrides both. Settings → Review owns this once the store adopts it.
# depth:
#   default: standard
#   rules:
#     - { files: 28, depth: thorough }           # counted after path_filters
#     - { path: "**/migrations/**", depth: deep }
#     - { label: needs-deep-review, depth: thorough }
```

- [ ] **Step 3: Confirm the example parses**

Temporarily uncomment the `depth:` block in `komodo.yaml`, then run:

```bash
pnpm --filter @komodo/core build && node packages/cli/dist/index.js config | grep -A8 depth
```

Expected: the resolved config prints `default: "standard"` and the three rules. Comment the block out again before committing.

- [ ] **Step 4: Commit**

```bash
git add docs/architecture/review-depth.md komodo.yaml packages/cli/komodo.yaml
git commit -m "docs: review depth — who decides, how it flows, how to tell if it helped

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Task 21: Verification bar (AGENTS.md rule 10)

- [ ] **Step 1: Run the full static bar**

```bash
pnpm typecheck && pnpm lint && pnpm build && pnpm -r test
```

Expected: every command exits 0. Fix anything that fails before you go on. Don't skip a step.

- [ ] **Step 2: Open the changed routes against a real store**

Start the queue on the seeded SQLite store:

```bash
node packages/cli/dist/index.js dev --no-poll --db /tmp/komodo-depth.db
```

(`--seed` is the default for `dev` on an empty store.) Open `http://localhost:4400` with the `run` skill or the browser preview, and check each item below. Note what you saw:

1. **Queue:** a row whose AI state allows a request shows "Review with AI" plus a chevron. The chevron opens three depths with their pass counts, and choosing one queues the run (the state pill turns to queued).
2. **PR page header:** "Ask AI review" has the same chevron and menu.
3. **Settings → Review → Review Depth:** the sidebar link scrolls there. The Segmented default persists after a reload. Adding the rule "Changed files at least / 28 / Thorough" shows it in the list and survives a reload. Typing `abc` for a files rule shows "Enter a whole number, 1 or more." and disables Add. Removing a rule works.
4. **A review page** (any seeded completed review): the footer reads like `Run … · seed · Thorough · 5 passes — 31 files changed (rule: at least 28) · head abc1234`.
5. **Analytics → PR Reviews:** "What deeper reviews found" shows three rows (1–10, 11–27, 28+) and three depth columns. Seeded data fills most cells, and empty cells show a dash.
6. **Settings → Usage:** credits per day equal passes, so a day with one thorough run shows 5. Developer rows now differ from one another. No "Providers reported" line appears, because seeded runs report no cost.

- [ ] **Step 3: Run one real deep review**

Requires a Claude or Codex login and `gh` auth:

```bash
cd /tmp && gh repo clone Delavalom/komodo-playground && cd komodo-playground
node /Users/delavalom/delavalom-labs/komodo-review-depth/packages/cli/dist/index.js pr 1 --local-only --depth deep
```

Expected: the progress lines include `depth: deep — requested.`, `running a second look…`, and a summary line like `deep · 2 passes — requested`.

- [ ] **Step 4: Run the eval once**

This spends quota. Run it once, from the playground clone:

```bash
node /Users/delavalom/delavalom-labs/komodo-review-depth/packages/cli/dist/index.js eval /Users/delavalom/delavalom-labs/komodo-review-depth/eval/playground.yaml
```

Expected: a table with three rows (standard, deep, thorough), each with `found n/4`, passes, cost and seconds. Record the table in the PR description as a single measured sample, not as a general claim (rule 14).

- [ ] **Step 5: Report**

Give the user what Steps 1–4 actually showed, including any failure, verbatim. Don't open a PR unless asked.

---

## Self-review notes (resolved inline)

- **Coverage of the four recommendations:** (1) depth tiers: Tasks 1–7. (2) routing rules, replacing "choose by hand every time": Tasks 1–2, 12 and 17; the person override in Tasks 13 and 16. (3) measurement: derived outcomes in Tasks 9, 10 and 19, plus `komodo eval` in Task 15. (4) cost/credits: pass and cost recording in Tasks 5–8, and the usage screen in Task 19. The `max_files` interplay is a decision, recorded in the table at the top.
- **Rule 1:** every port change (Tasks 8 and 9) lands in both drivers with conformance tests in the same task.
- **Rule 3:** `reviewDepth` and `depthRules` get a field (Task 11), a translation (Task 12) and a control (Task 17).
- **Type names used across tasks:** `ReviewDepth`, `DepthRequest {depth, by}`, `DepthDecision {depth, reason}`, `PassRun {result, passes, costUsd}`, `ReviewRecord.run {depth, depthReason, passes, costUsd}`, `ReviewRunOutcome`, `DepthRuleSetting {kind, value, depth}`, `REVIEW_DEPTH_ORDER` (store) vs `REVIEW_DEPTHS` (core); the two are asserted equal in Task 12.
