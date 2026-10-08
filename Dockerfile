# syntax=docker/dockerfile:1
FROM oven/bun:1.4.0 AS bun
FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
# Explicit optional SHA mounts keep Coolify from injecting per-app secret lists
# into shared steps. These steps do not consume the SHA or any app secrets.
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
RUN --mount=type=secret,id=SOURCE_COMMIT apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
COPY package.json bun.lock ./
RUN --mount=type=secret,id=SOURCE_COMMIT bun install --frozen-lockfile --ignore-scripts
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN --mount=type=secret,id=SOURCE_COMMIT node node_modules/prisma/build/index.js generate

FROM dependencies AS source
COPY --exclude=docker-compose.yaml --exclude=docker-compose.yml --chown=node:node . .

# Disposable Postgres exists only in this build stage, never in runtime images.
FROM postgres:18.6-bookworm AS checks
WORKDIR /app
RUN --mount=type=secret,id=SOURCE_COMMIT apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates openssl && rm -rf /var/lib/apt/lists/*
COPY --from=dependencies /usr/local/bin/node /usr/local/bin/node
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
COPY --from=source /app ./
# Override Coolify's host-network build default: test databases must be isolated.
# Coolify's changing --add-host entries can invalidate even identical RUN layers.
# The locked cache stores only successful checks for exact source/toolchain hashes.
ARG PB_CHECK_CACHE_EPOCH=1
RUN --mount=type=secret,id=SOURCE_COMMIT --mount=type=cache,id=pickleballs-checks-v1,target=/var/cache/pickleballs-checks,sharing=locked --network=none ln -s /usr/local/bin/bun /usr/local/bin/bunx && node deploy/cached-checks.mjs

# Coolify's generated Compose file changes per release/app. Bind the context only
# here to invalidate the commit stamp even for docs-only commits. Do not copy
# that generated configuration into shared checks or runtime images.
FROM source AS release
ARG SOURCE_COMMIT
RUN --mount=type=bind,source=.,target=/release-context --mount=type=secret,id=SOURCE_COMMIT node scripts/write-release-commit.mjs

FROM release AS build
COPY --from=checks /app/.checks-passed /app/.checks-passed
ARG S3_PUBLIC_ENDPOINT=https://s3.pickle-balls.com
ARG NEXT_PUBLIC_APP_URL=https://pickle-balls.com
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV PB_SELF_HOSTED=true NEXT_TELEMETRY_DISABLED=1 PB_BUILD_TYPECHECKED=true
# Build-only placeholders, never copied into runtime environment configuration.
RUN NODE_OPTIONS=--max-old-space-size-percentage=100 DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build DISCORD_CLIENT_ID=build DISCORD_CLIENT_SECRET=build BETTER_AUTH_SECRET=build-only-not-a-runtime-secret-000000 node node_modules/next/dist/bin/next build

FROM dependencies AS web
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.release-commit ./
COPY --from=build --chown=node:node /app/.next/static ./release-static
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --chown=node:node prisma.deploy.config.ts ./
COPY --chown=node:node deploy/start-web.sh ./start-web.sh
COPY --chown=node:node deploy/migrate.mjs ./deploy/migrate.mjs
COPY --chown=node:node deploy/healthcheck.mjs ./deploy/healthcheck.mjs
RUN mkdir -p /app/.next/static && chown node:node /app/.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "start-web.sh"]

FROM release AS migrate
ENV NODE_ENV=production PB_SELF_HOSTED=true
USER node
CMD ["node", "deploy/migrate.mjs"]

FROM dependencies AS worker-dependencies
RUN --mount=type=secret,id=SOURCE_COMMIT apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

FROM worker-dependencies AS worker
# Reuse the successful shared checks; the worker never compiles Next.js.
COPY --from=checks /app/.checks-passed /app/.checks-passed
# Dependencies and generated Prisma client are already inherited. Copying /app
# from source would duplicate the entire node_modules tree just to change owner.
COPY --exclude=docker-compose.yaml --exclude=docker-compose.yml --chown=node:node . .
COPY --from=release --chown=node:node /app/.release-commit ./
ENV NODE_ENV=production PB_SELF_HOSTED=true BACKGROUND_BACKEND=postgres
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s CMD node -e "fetch('http://127.0.0.1:3001').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "node deploy/migrate.mjs && exec node --conditions=react-server --import tsx scripts/worker.ts"]

# Shared immutable assets avoid chunk 404s while old and new web containers overlap.
FROM nginx:1.28-alpine AS assets
COPY deploy/assets.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1
