# Bringing the backend online

The schema in `schema.ts` is complete and mirrors `src/lib/types.ts` field for
field. No functions are written yet — the app runs entirely off
`src/lib/data/seed.ts` behind the hooks in `src/lib/data/{queries,mutations}.ts`.

## The swap

1. `npx convex dev` — creates the deployment and pushes `schema.ts`.
2. Write one function, e.g. `convex/pullRequests.ts`:

   ```ts
   export const list = query({
     args: { orgId: v.id("organizations"), /* … */ },
     handler: async (ctx, args) => { /* … */ },
   });
   ```

3. Change exactly one hook body in `src/lib/data/queries.ts`:

   ```diff
   -export function usePullRequests(query: PullRequestQuery = {}) {
   -  const prs = useDataStore((s) => s.pullRequests);
   -  return useMemo(() => /* filter + sort */, [prs, query]);
   -}
   +export function usePullRequests(query: PullRequestQuery = {}) {
   +  return useQuery(api.pullRequests.list, { orgId, ...query }) ?? [];
   +}
   ```

Every hook carries a `convex:` doc comment naming the function it becomes, so
the mapping is mechanical. A half-migrated app still runs, because every
component goes through the seam.

## Two things to keep in mind

- **Analytics are derived, not stored.** `useAnalyticsSummary`,
  `useReviewsSeries` and friends compute from the PR/finding list at read time.
  Port them as Convex queries that do the same, so a filtered list and its
  summary can never disagree. Do not add aggregate tables.
- **`useUsageDays` is the one seeded exception.** There is no source entity for
  credit spend in a static dataset, so it is generated from `rng(...)`. When the
  backend lands, that hook reads the real `usageDays` table and the seed goes.

## Seeding a deployment

`src/lib/data/seed.ts` is plain data — import it from a Convex action and
insert row by row, mapping the string ids to real `Id<…>` values as you go.
