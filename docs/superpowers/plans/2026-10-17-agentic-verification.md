# Agentic Verification Implementation Plan

**Goal:** Build the ideas from Addy Osmani's "Agentic Verification" (2026-10-14) into Komodo where they strengthen what the product already promises: humans review evidence, not diffs, and Komodo supplies the context and evidence the authoring agent lacked. Apply the same discipline to Komodo's own test suite.

**Source:** https://addyo.substack.com/p/agentic-verification. Ideas used: tests as the agent's way of "sensing the world", E2E checks that define "done", a feature map an agent can drive the app from, property-based tests, differential tests with an oracle, fast/deterministic loops, and recording a recurring mistake so it does not recur.

**Tech stack:** TypeScript, zod v4, vitest, fast-check (new, dev only), node:sqlite + PGlite, Next.js app router.

---

## Ground rules

- **Rule 1:** no port method is added. The differential test drives existing methods on both drivers.
- **Rule 3:** the feature map is a fixed repository convention, not a setting, so it adds no field and needs no control.
- **Rule 7:** no `useEffect`. The modal's prefill uses initial state plus a `key` reset.
- **Rule 13:** the feature map paths are constants, not user input, but each is still re-resolved through `realpath` and refused if it leaves the checkout (a symlinked `docs/` could otherwise point anywhere).
- **Rule 15:** every prompt change asks for better *questions and checks for a person*. Nothing here lets a model claim a check passed.
- **Workspace packages resolve to `dist`.** Rebuild `diagram`, `core` and `store` before testing `ingest`, `cli` or `apps/web`.

## Out of scope (deliberately)

- **Auto-attaching CI artifacts (Playwright traces, screenshots) to verification evidence.** A person can already paste an artifact URL as `evidenceUrl`. Pulling artifacts automatically needs the same design as the approved mutation-evidence follow-up (CI produces the report, Komodo reads it pinned to the head, never runs PR code). That gets its own plan rather than a rushed half here.
- **Fuzzy detection of "recurring" findings across reviews.** Model titles vary run to run. Grouping them would be a guess presented as a number (rule 4/14). Task 4 gives the person a direct way to turn a finding into a rule instead.

---

## Task 1 — A sharper test-adequacy question (core)

Files: `packages/core/src/providers/prompt.ts`, `packages/core/test/prompt.test.ts`.

1. Expand `LENS_BRIEF.tests` so the thorough tests lens also asks:
   - Would each test fail against a plausible wrong implementation, or does it restate the code's own logic (mocks of the thing under test; expectations computed the same way the code computes them)?
   - Were the tests written alongside the code they test? If so, they can share its misunderstanding, so name the behaviour no independent check pins down.
   - Where a rule must hold for every input (round-trip, invariant, idempotency, equivalence to a simpler reference), is there a property-based test or only examples?
   - For a rewrite or migration, is the old behaviour used as the oracle (side-by-side comparison), or is the new code only tested against itself?
2. Extend the base prompt's `tests` focus definition with the same idea in one line.
3. Add to the `verificationChecks` guidance: each check is the definition of done for one result. Prefer one end-to-end flow a person can follow over several partial ones, and state the observable outcome, not an internal one.
4. Tests: assert the tests lens and base prompt carry the new questions; assert the standard (base) prompt still has no pass section.

## Task 2 — The feature map as reviewer context (core, cli)

Files: new `packages/core/src/feature-map.ts`; `providers/types.ts`, `providers/prompt.ts`, `pipeline.ts`, `index.ts`; `packages/cli/src/commands/prompt.ts`, `packages/cli/src/commands/pr.ts`; new `packages/core/test/feature-map.test.ts`.

1. `readFeatureMap(repoDir)`: checks `FEATURE_MAP_PATHS = ["docs/feature-map.md", "FEATURES.md", ".github/feature-map.md"]` in order, returns the first readable non-empty file as `{ path, text, truncated }`, truncated at 8,000 characters (the memory cap). Every candidate is realpath-resolved and refused when outside the checkout. Never throws.
2. `ReviewInput.featureMap?: { path; text }`. `buildReviewPrompt` adds a `## Feature map` section and tells the model to write `verificationChecks` instructions from the map's routes, entry points and expected outcomes, and to say so in the instruction when a changed flow is not in the map.
3. `runReview` reads it when `repoDir` is set, reports it through `onProgress`, and returns `featureMap: string | null` on the outcome. The server path (`packages/ingest/src/review.ts`) already passes `repoDir`, so it gets this without changes.
4. `komodo prompt` reads it from the git top level; `komodo pr` prints which map was used.
5. Tests: first-match order, empty file skipped, truncation, symlink escaping the tree refused, missing directory returns null; prompt section present only when given.

## Task 3 — Komodo's own feature map, kept honest by a check

Files: new `docs/feature-map.md`, new `scripts/check-feature-map.mjs`, root `package.json`.

1. Write the map for `apps/web`: every route, what it is for, the query params that hold its view state (rule 8), and what a seeded `komodo dev` store shows there.
2. `check-feature-map.mjs` lists every `page.tsx` under `apps/web/src/app`, turns each into its URL pattern, and fails when one is missing from the map. Wire it into the root `test` script next to `check:voice` as `check:feature-map`.

## Task 4 — Turn a finding into a team rule (web)

Files: `apps/web/src/components/memory/add-context-modal.tsx`, `apps/web/src/components/review/queue.tsx`.

1. `AddContextModal` takes an optional `initial` (`ruleText`, `scopeRepo`, `scopePattern`) used as initial state. Callers reset it with `key`.
2. In the decision queue, once a judgement has an `Agreed` or `Blocks` answer, show "Remember this for future reviews". It opens the modal prefilled: the rule text from the judgement (What / Why), scoped to this review's repository and to the judgement's file glob.
3. The reviewer already reads active rules (`packages/ingest/src/memory.ts`) and the memory screens already derive acceptance from judgements citing a rule, so the loop closes without new storage.

## Task 5 — Property-based tests for the rules that decide status

Files: new `packages/core/test/properties.test.ts`, new `packages/store/test/properties.test.ts`.

- `verificationStatus`: any required `failed` → `failure`; `success` exactly when every required check's latest entry is `verified`; optional checks never change the state; `version` is equal for equal inputs.
- `scoreCase`: hits and missed partition the expectations, in order.
- `mergeResults`: merging with no extra results returns the base judgements unchanged; merging a result into itself adds nothing.
- `verificationRequirementId`: deterministic; changing any one field changes it; fields cannot be shifted across the separator to collide.
- `readChecks`: never returns a rollup whose head differs from the PR head or that is older than `CHECKS_MAX_AGE_MS`.

Seeded runs (`fc.configureGlobal({ seed })` via a fixed seed) so failures reproduce, matching rule 5's spirit.

## Task 6 — Differential test: SQLite and Postgres side by side

File: new `packages/store/test/differential.test.ts`.

fast-check generates a sequence of ledger writes (answers, withdrawals, votes, vote withdrawals, verification evidence) over one saved review. The same sequence is applied to a `SqliteStore` and a PGlite `PostgresStore`. Then compare, after normalising ids and timestamps: `loadReview` answers, votes and verifications, `listAnswers`, `listVerificationEntries`, and the snapshot's verification summaries. A simple in-test model is also an oracle for the newest answer per judgement, one vote per person per judgement, and the summary counts. Conformance shows each driver passes hand-picked cases; this shows they agree with each other on cases nobody picked.

## Task 7 — Record the decision

File: new `docs/architecture/agentic-verification.md` (short ADR): what was adopted, where it lives, and what was left out and why.

## Verification (rule 10)

`pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm -r test`, `node scripts/check-feature-map.mjs`, then open the review route against a real seeded store and use "Remember this for future reviews" end to end, confirming the rule appears under Custom context.
