# Project rules

Inherited by every future session in this repo. These are not suggestions.

1. **The store's port is the contract.** `packages/store/src/port.ts` defines
   everything Komodo persists and every way to read or write it. Two drivers
   implement it — SQLite for `komodo dev`, Postgres for `komodo serve` — and
   `packages/store/test/conformance.ts` runs unchanged against both. Add a
   method → implement it twice and cover it there, in the same commit. A
   driver that passes conformance and one that does not is the only way the
   two deployments can behave differently, and that must never happen.

2. **Never import a `seed.ts` from a component.** App surfaces go through the
   hooks in `src/lib/data/queries.ts` and `mutations.ts`. Shared entities come
   off the server snapshot; the writes are server actions in
   `src/lib/data/actions.ts`. What is left in `lib/data/seed.ts` is one
   person's own display preferences and nothing else.

3. **A screen that configures the reviewer must reach the reviewer.** The
   settings page wrote to localStorage for a long time while `komodo.yaml`
   remained the only thing the reviewer read, and every control on it was a
   lie. `packages/ingest/src/settings.ts` is the seam that fixes that: a field
   there has a control, a control has a field there. Adding one without the
   other recreates exactly the bug that file exists to prevent. The same
   applies to settings the *poller* reads rather than the reviewer:
   `autoEnableNewRepos` had a toggle and no reader for as long as nothing
   looked for a new repository — `packages/ingest/src/discover.ts` is what
   gives it one.

4. **Derive analytics, don't store them.** Summaries, series, leaderboards,
   engagement counts and a finding's status are computed at read time from the
   rows that caused them, so a number and its cause cannot drift. `upvotes`,
   `totalComments`, `addressedComments` and `reviewCount` used to be columns;
   the only thing that ever wrote them was the seeder. If you find yourself
   adding a counter column, you are adding a second version of the truth.

5. **The seeder is a real dataset, not a set of numbers.** `komodo dev`
   without a token still has to show a queue, and it does it by writing real
   reviews, real answers and real votes through the same port the ingester
   uses — never by setting a display value directly. Seed from `rng(seed)`,
   never `Math.random()`.

6. **"Now" arrives as a prop.** Every age on screen is a subtraction from a
   clock, and reading one during render gives the server and the client two
   answers. The app answered that for a long time with a constant pinned to
   the day the fixtures were captured — identical markup, and every age wrong
   by however long ago that was. The clock is now read once per request in
   `lib/data/server.ts` and carried down by `DataProvider`: client components
   take it from `useNow()`, `relativeTime` requires it, and `Date.now()` in a
   component is a lint error rather than a judgement call.

7. **No `useEffect`.** Use derived state, event handlers, `useMemo`, or
   `useSyncExternalStore`'s subscribe contract. `useMountEffect` and
   `useDismiss` already wrap the two cases that need it.

8. **The URL holds view state.** Filters, the active tab, the open drawer and
   the judgement on screen are query params (`?j=3`, `?tab=findings`,
   `?status=completed&impact=critical`, `?memory=<id>`), so a link into a
   review opens on the thing being discussed.

9. **The app shell is fixed-height.** The rule lives in
   `src/app/(app)/layout.tsx` (`h-dvh overflow-hidden`), not on `body` — each
   content pane owns its own `overflow-y-auto`, and adding a route without a
   scroll container will silently clip.

10. **Verification bar:** `pnpm typecheck`, `pnpm lint`, `pnpm build` and
    `pnpm -r test` clean, **and** the changed routes opened against a real
    store. Types passing says nothing about whether a screen shows a number
    nothing can produce.

11. **Attribution is per-device, and that is deliberate.** Komodo has no
    authentication. `pickActor` turns a login into a roster member and the
    cookie in `lib/data/actor.ts` supplies it; every answer and vote records
    that member. It is not a credential and must not be described as one — but
    it is what stops a shared deployment filing a whole team's decisions under
    `team.you`. Real auth replaces where the login comes from, nothing else.

12. **Secrets have one path out of the store.** An API key is stored as a
    SHA-256 and returned in plaintext exactly once, at creation. An
    integration's token leaves only through `loadIntegrationToken`, for the
    ingester. `listApiKeys` and `listIntegrations` must never carry either.

13. **A user-supplied string that becomes a filesystem path gets checked.**
    `packages/ingest/src/memory.ts` resolves globs from a settings field
    against a checkout, and re-resolves every result to confirm it is inside
    the tree. Any new path that comes from a text field does the same.

14. **This app began as a clone of another product; do not reintroduce it.**
    Its branding, copy, agent surfaces and URL parameters have been removed and
    replaced with Komodo's own. Structural text — nav labels, headings, button
    labels — is ours to write. Do not reintroduce another product's name into
    the UI, nor invented customer quotes or statistics nobody measured.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
