# Komodo as a team deployment.
#
# `komodo serve` in a container: the poller, the reviewer and the queue UI in
# one process tree. Polling means there is no webhook to receive, so this
# needs no GitHub App and no inbound path from GitHub — only egress to
# api.github.com and to whichever model provider is configured.
#
# Build:  docker build -t komodo .
# Run:    docker run -p 4400:4400 --env-file komodo.env \
#           -v $PWD/komodo.yaml:/app/komodo.yaml -v komodo-state:/app/.komodo komodo

# node:24 because @komodo/store's SQLite driver reaches node:sqlite and the
# package declares engines >=24. A Postgres deployment never loads that driver
# — the import is dynamic — but the install still has to satisfy the engine.
FROM node:24-bookworm-slim AS build
WORKDIR /app

RUN corepack enable

# Manifests first, so editing source does not invalidate the dependency layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/store/package.json packages/store/
COPY packages/ingest/package.json packages/ingest/
COPY packages/cli/package.json packages/cli/
RUN pnpm install --frozen-lockfile

COPY . .
# The root script owns the order: workspace libraries, web app, then CLI.
# Keeping it in one place prevents CI, release, and Docker from drifting.
RUN pnpm build:release
# Materialize the CLI's production dependencies without workspace symlinks.
# The bundle contains Komodo's workspace packages, but intentionally keeps
# third-party packages external just like the npm release does.
RUN pnpm --filter komodo-review deploy --legacy --prod --offline /app/cli-runtime

FROM node:24-bookworm-slim AS runtime
WORKDIR /app

# git fetches the working tree each review reads — without it every review
# silently degrades to the diff alone. ca-certificates for the fetch itself.
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /app/.komodo

ENV NODE_ENV=production

# tsup bundles @komodo/core, /store and /ingest. Third-party runtime packages
# remain external, so copy the lockfile-resolved production deployment too.
COPY --from=build /app/cli-runtime/dist/index.js /app/cli-runtime/dist/*.js ./cli/dist/
COPY --from=build /app/cli-runtime/package.json ./cli/package.json
COPY --from=build /app/cli-runtime/node_modules ./cli/node_modules

# The app is copied out of the build rather than unpacked from dist/web.tgz at
# runtime: the tarball exists for the npm tarball's sake, where a directory
# named node_modules cannot survive publication. Here it can, so the image
# starts without unpacking anything.
COPY --from=build /app/apps/web/.next/standalone ./web
ENV KOMODO_WEB_DIR=/app/web/apps/web

RUN chown -R node:node /app
USER node

# HOSTNAME is what the Next server binds to; its 127.0.0.1 default is
# unreachable from outside the container.
ENV HOSTNAME=0.0.0.0
EXPOSE 4400

# The queue's own routes render the app shell, so probing one would report a
# database outage as a 500 on a page. /api/health answers the same question in
# one query and distinguishes a dead store from a stalled poller.
# start-period covers the first poll, which fetches a working tree per repo.
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4400/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# komodo.yaml is the roster — which repositories are watched, who the team is,
# what gets posted back to GitHub. Mount it at /app/komodo.yaml.
# Volume /app/.komodo holds the working trees and, for a SQLite deployment,
# the database; without it a restart re-fetches every repository.
ENTRYPOINT ["node", "/app/cli/dist/index.js"]
CMD ["serve", "--port", "4400", "--interval", "300"]
