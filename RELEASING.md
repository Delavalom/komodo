# Releasing

Komodo ships three artifacts from this repository. Their release paths share
one verification gate.

- **`komodo-review` on npm** is the CLI, with the web app packed inside it.
- **`ghcr.io/delavalom/komodo`** is the team deployment image.
- **The Claude Code plugin** has no registry. A marketplace *is* a git
  repository, so pushing to `main` is the publish.

The plugin's skill runs `npx komodo-review prompt`, which resolves to the
`latest` tag on npm. **npm goes first.** A plugin pushed ahead of the package
it calls installs cleanly and fails on its first step. This is exactly what
happened when the plugin advertised 0.4.0 and the registry's `latest` was a
0.2.0 that had no `prompt` command.

## Before pushing

Run the same gate that GitHub runs for every pull request and every push to
`main`:

```bash
pnpm verify
```

The gate checks the release manifests, lint, the production build, types, unit
and integration tests, and the installed npm package end to end. GitHub also
builds and runs the container image. The pull request template asks what
changed, which automated test proves it, and which shipped path you ran.

## Cutting one

```bash
# 1. One version, eight places. Edit them, then prove it:
#      apps/web/package.json               version
#      packages/cli/package.json           version
#      packages/core/package.json          version
#      packages/ingest/package.json        version
#      packages/store/package.json         version
#      plugin/.claude-plugin/plugin.json   version
#      .claude-plugin/marketplace.json     metadata.version
#      .claude-plugin/marketplace.json     plugins[].version
pnpm check:release

# 2. The full bar, plus the plugin manifest as Claude reads it
pnpm verify
claude plugin validate .

# 3. Merge to main, then tag. The tag triggers Release, which refuses to
#    publish if it disagrees with packages/cli/package.json.
version=$(node -p "require('./packages/cli/package.json').version")
git tag "v${version}" && git push origin "v${version}"
```

That publishes the npm package (with provenance) and the
`ghcr.io/delavalom/komodo` image. Then the plugin is already live for anyone
who has added the marketplace. They must run `/plugin update` because the
cache is keyed by version (`~/.claude/plugins/cache/komodo/komodo/<version>/`).
A plugin change without a version bump reaches nobody.

`workflow_dispatch` verifies and builds both release artifacts. It runs
`npm publish --dry-run` and never publishes npm or GHCR output.

## Publishing by hand

Only if the workflow is unavailable. `pnpm` packs and `npm` publishes: pnpm
rewrites the `workspace:` protocol that npm cannot read. npm can attach
provenance, but it cannot do that outside CI. Expect an unsigned tarball.

```bash
npm login
pnpm build:release                              # libraries, app, then CLI
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
- **`@komodo/*` appear in the published `devDependencies`** at the release
  version. They exist in this workspace and not on any registry. They are
  bundled into `dist/` by tsup, and a consumer never installs another
  package's devDependencies, so nothing resolves them.
- **The CLI declares node >=22 while `@komodo/store` declares >=24.** Only a
  SQLite store needs `node:sqlite`; `pr`, `diff` and `prompt` run on 22. The
  driver is imported dynamically and says so when it cannot load.
