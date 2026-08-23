# Releasing

Komodo ships two artifacts from this repository, and they are not independent.

- **`komodo-review` on npm** — the CLI, with the web app packed inside it.
- **The Claude Code plugin** — no registry: a marketplace *is* a git
  repository, so pushing to `main` is the publish.

The plugin's skill runs `npx komodo-review prompt`, which resolves to the
`latest` tag on npm. **npm goes first.** A plugin pushed ahead of the package
it calls installs cleanly and fails on its first step — which is exactly what
happened when the plugin advertised 0.4.0 and the registry's `latest` was a
0.2.0 that had no `prompt` command.

## Cutting one

```bash
# 1. One version, four places. Edit them, then prove it:
#      packages/cli/package.json          version
#      plugin/.claude-plugin/plugin.json  version
#      .claude-plugin/marketplace.json    metadata.version
#      .claude-plugin/marketplace.json    plugins[].version
pnpm check:release

# 2. The full bar (AGENTS.md 10), plus the plugin manifest as Claude reads it
pnpm lint && pnpm build && pnpm typecheck && pnpm -r test
claude plugin validate .

# 3. Merge to main, then tag. The tag triggers Release, which refuses to
#    publish if it disagrees with packages/cli/package.json.
git tag v0.4.0 && git push origin v0.4.0
```

That publishes the npm package (with provenance) and the
`ghcr.io/delavalom/komodo` image. Then the plugin is already live for anyone
who has added the marketplace — but only after they run `/plugin update`: the
cache is keyed by version (`~/.claude/plugins/cache/komodo/komodo/<version>/`),
so a plugin change without a version bump reaches nobody.

`workflow_dispatch` runs the same job with `dry_run` on, which packs and
`npm publish --dry-run`s without shipping anything.

## Publishing by hand

Only if the workflow is unavailable. `pnpm` packs and `npm` publishes: pnpm
rewrites the `workspace:` protocol that npm cannot read, and npm is the one
that can attach provenance (which it will not do outside CI — expect an
unsigned tarball).

```bash
npm login
pnpm build:release                              # the app before the CLI
pnpm --filter komodo-review pack --pack-destination /tmp
npm publish /tmp/komodo-review-*.tgz --access public
```

`pnpm publish` on its own refuses on a dirty tree; `--no-git-checks` skips
that, which is the wrong thing to skip during a release.

## Things that are true and look like bugs

- **The tarball is ~15 MB.** Nearly all of it is `dist/web.tgz`, the packed
  Next standalone build, because npm strips any directory named
  `node_modules` and a standalone server resolves out of exactly that. So it
  travels as a file and unpacks on first run. Everyone pays that download,
  including `npx komodo-review prompt`, which never opens it. Splitting the
  app into its own package is the fix and has not been done.
- **`@komodo/*` appear in the published `devDependencies`** at `0.1.0`,
  versions that exist in this workspace and not on any registry. They are
  bundled into `dist/` by tsup, and a consumer never installs another
  package's devDependencies, so nothing resolves them.
- **The CLI declares node >=22 while `@komodo/store` declares >=24.** Only a
  SQLite store needs `node:sqlite`; `pr`, `diff` and `prompt` run on 22. The
  driver is imported dynamically and says so when it cannot load.
