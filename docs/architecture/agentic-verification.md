# Agentic verification

Status: Accepted
Date: 2026-10-17

## Context

Addy Osmani's "Agentic Verification" (2026-10-14) argues that the bottleneck
has moved from writing code to knowing it is correct. Agents should verify
their own work with end-to-end runs, properties and differential comparisons.
The human's job moves from reading diffs to defining success and reviewing
evidence. That is the premise of [evidence-first human review](evidence-first-human-review.md).
The article also names gaps Komodo had not closed:

- A test written by the agent that wrote the code can share the code's
  misunderstanding, and still pass.
- Verification steps written without a map of the app are guesses.
- A mistake a team corrects once should not need correcting again.

## Decision

**The tests question asks what would catch a wrong implementation.** The base
prompt treats a test that passes against a plausible wrong implementation as
proving the wrong thing. The thorough tests lens also asks four things. Does
a test mock what it tests? Was it written alongside the code and so shares its
assumptions? Is a rule that must hold for every input checked by a property or
only by examples? Is a rewrite compared against the old behaviour? Each
verification check is framed as the definition of done for one result, as
one end-to-end flow where possible.

**The feature map is reviewer context.** `readFeatureMap` in
`packages/core/src/feature-map.ts` reads the first of `docs/feature-map.md`,
`FEATURES.md` or `.github/feature-map.md` from the checkout at the head. Check
instructions are written from it, and a check says so when its flow is not in
the map. It is a convention, not a setting, so it adds no field without a
control (rule 3). Each candidate is resolved and refused if a symlink takes it
outside the checkout (rule 13's spirit: the author controls the tree).
Komodo's own map is `docs/feature-map.md`. `scripts/check-feature-map.mjs`
fails the build when a route is missing from it.

**A decision can become a rule.** After a person agrees with or blocks on a
judgement, the decision queue offers to save it as a custom rule, prefilled
with what was raised, what was decided and why, and scoped to the repository
and directory. The reviewer already applies active rules. The memory screens
already derive a rule's acceptance from the judgements that cite it. No new
storage is needed.

**Komodo's own suite follows the same discipline.**
`packages/core/test/properties.test.ts` and
`packages/store/test/properties.test.ts` state the rules that decide what a
person sees (merge, eval scoring, verification status, requirement ids, check
freshness) as fast-check properties. `packages/store/test/differential.test.ts`
applies random ledger writes to SQLite and Postgres side by side, with a
frozen clock. It compares every derived read and checks both against a plain
model of the ledger rules. Seeds are fixed so a failure reproduces. It runs
as its own stage after the regular store suite (`test:differential`). Running
alongside that suite, its PGlite load pushed an existing Postgres test past its
timeout, and a new test that makes an old one flaky has made the whole loop
less trustworthy.

## Not done here

- **CI artifacts as evidence.** A person can paste an artifact URL into
  `evidenceUrl` today. Reading them automatically needs the mutation-evidence
  design: CI produces the report, Komodo reads it pinned to the head and never
  runs pull-request code.
- **Detecting "recurring" findings across runs.** Model titles vary between
  runs. A count of near-duplicates would be a guess shown as a number
  (rules 4 and 14). The person turning a decision into a rule is the signal.

## Consequences

The differential test found two places where the documentation lagged the
code. The verification summary's `failed` and `blocked` count required checks
only. `addressedComments` excludes judgements that were passed on. Both are
now stated where the fields are defined.
