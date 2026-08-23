# Project rules

Inherited by every future session in this repo. These are not suggestions.

1. **The SPECs are the contract.** `docs/SPEC.md` describes the *original*
   app.greptile.com; `docs/SPEC-MARKETING.md` describes the *original*
   www.greptile.com (its sections are cited as `M§n`). Neither describes this
   repo. Components cite section numbers. Change behaviour → update the
   matching SPEC in the same commit.

2. **Never import a `seed.ts` from a component.** App surfaces go through the
   hooks in `src/lib/data/queries.ts` and `mutations.ts`. Marketing surfaces go
   through the plain functions in `src/lib/data/marketing/queries.ts` — plain,
   because marketing pages are server components and a server component cannot
   call a hook. Either way each export carries a `convex:` doc comment naming
   the function it becomes; keep it accurate, because it is the migration plan.

3. **The schemas mirror the types field for field.** `convex/schema.ts` ↔
   `src/lib/types.ts`, and `convex/marketing-schema.ts` ↔
   `src/lib/marketing-types.ts`. Same commit, always.

4. **Derive analytics, don't store them.** Summaries, series and leaderboards
   are computed from the entity list at read time inside `queries.ts`, so a
   filtered list and its widgets can never disagree. The one seeded exception is
   `useUsageDays` — keep it the only one.

5. **Data stays deterministic.** Seed from `rng(seed)`, never `Math.random()`.
   Read "now" from the pinned `NOW`, never `Date.now()` or `new Date()` during
   render. Server and client must produce identical markup.

6. **No `useEffect`.** Use derived state, event handlers, `useMemo`, or
   `useSyncExternalStore`'s subscribe contract. `useMountEffect` and
   `useDismiss` already wrap the two cases that need it.

7. **The URL holds view state.** Filters, active tab and open drawer are query
   params, in the original's exact encoding (`?tab=greptile-findings`,
   `?status=completed&impact=critical`, `?sort=asc`, `?memory=<id>`). A URL
   copied out of the real app must open the same screen here.

8. **The app shell is fixed-height; the marketing site is not.** The rule
   lives in `src/app/(app)/layout.tsx` (`h-dvh overflow-hidden`), not on
   `body` — each app content pane owns its own `overflow-y-auto`, and adding an
   app route without a scroll container will silently clip. Marketing routes
   scroll the document and need nothing. M§12.2.

9. **Verification bar:** `npx tsc --noEmit`, `pnpm lint` and `pnpm build` clean,
   **and** the changed routes opened in a browser and compared against the recon
   screenshots. Types passing says nothing about whether a chip renders a stray
   colon, or whether a figure drawn in ink vanishes on an ink-coloured band.

10. **The two palettes never touch.** App tokens are `hsl(var(--token))` on
    `:root` and flip with `data-theme`. Marketing tokens are static hexes,
    namespaced `mkt-`, scoped under `.mkt`. A marketing component must not read
    an app token, and vice versa. Radius on the marketing side is 0 everywhere —
    the chamfer is the only shape treatment. M§1.

11. **Marketing figures are ground-agnostic.** Every placeholder in
    `components/marketing/figures.tsx` renders on both the light ground and
    Basalt, so neutral strokes and fills use `currentColor`, never a literal
    ink hex. Accent colours (green, axolotl, pollen) may be literal.

12. **Do not put the original's editorial in this repo.** Structural text — nav
    labels, headings, button and form labels, plan names — is reproduced because
    it is the interface. Long-form prose is written fresh, and quotes,
    customers, logos, findings and statistics are invented rather than copied or
    paraphrased: attributing real statements to real people in a clone
    misrepresents them. M§12.3 is the full statement, and the README repeats it.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
