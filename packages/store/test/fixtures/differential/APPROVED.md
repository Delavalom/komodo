# Approved differential divergences

Per `01-standards.md` §S3: every intentional, accepted difference a
differential test finds between SQLite and Postgres goes here, one line
each — `input id`, `expected difference`, `reason` — instead of being
silently special-cased inside the test. This file didn't exist before this
PR (`migrations.differential.test.ts`); it establishes the pattern for this
package. `differential.test.ts` (merged with `feat/agentic-verification`)
predates this file and has no entries to carry over — it found no
divergence to approve.

A line belongs here only when the difference is *intended* — e.g. a type
each dialect represents differently on purpose. A difference nobody decided
on is a bug, not an approval: it gets pinned as a named regression test in
the differential file itself (see `migrations.differential.test.ts`'s
"BUG #1" case — Postgres's `012-verification-entry-order` backfill orders a
legacy `createdAt` tie differently than SQLite's does), with its own
follow-up fix tracked separately, not recorded here as accepted.

No entries yet.

<!-- input id | expected difference | reason -->
