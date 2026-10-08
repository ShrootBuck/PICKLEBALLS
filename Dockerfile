# syntax=docker/dockerfile:1
FROM oven/bun:1.4.0 AS bun
FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN node node_modules/prisma/build/index.js generate

FROM dependencies AS source
COPY --chown=node:node . .
ARG SOURCE_COMMIT
RUN node scripts/write-release-commit.mjs

# Disposable Postgres exists only in this build stage, never in runtime images.
FROM postgres:18.6-bookworm AS checks
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates openssl && rm -rf /var/lib/apt/lists/*
COPY --from=dependencies /usr/local/bin/node /usr/local/bin/node
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
COPY --from=source /app ./
# Override Coolify's host-network build default: test databases must be isolated.
RUN --network=none ln -s /usr/local/bin/bun /usr/local/bin/bunx && sh deploy/check-build.sh

FROM source AS build
# Force the checks to finish successfully before compiling either deployment.
COPY --from=checks /app/.checks-passed /app/.checks-passed
ARG S3_PUBLIC_ENDPOINT=https://s3.pickle-balls.com
ARG NEXT_PUBLIC_APP_URL=https://pickle-balls.com
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV PB_SELF_HOSTED=true NEXT_TELEMETRY_DISABLED=1
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

FROM source AS migrate
ENV NODE_ENV=production PB_SELF_HOSTED=true
USER node
CMD ["node", "deploy/migrate.mjs"]

FROM dependencies AS worker-dependencies
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

FROM worker-dependencies AS worker
# A worker release also requires a successful web compile.
COPY --from=build /app/.next/BUILD_ID /app/.web-build-passed
COPY --chown=node:node . .
ARG SOURCE_COMMIT
RUN node scripts/write-release-commit.mjs
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
