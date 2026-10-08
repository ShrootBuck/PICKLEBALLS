#!/bin/sh
set -eu
# Coolify can inject build secrets into RUN. Start checks with a clean environment
# so tests cannot contact production services or use production credentials.
if [ "${PB_CLEAN_CHECKS:-}" != 1 ]; then
  exec env -i PATH="$PATH" HOME=/tmp PB_CLEAN_CHECKS=1 sh deploy/check-build.sh
fi
export DATABASE_URL=postgresql://postgres:disposable@127.0.0.1:5432/pickleballs_test
export DIRECT_DATABASE_URL="$DATABASE_URL"
export PB_BUILD_TEST_DATABASE_URL="$DATABASE_URL"
export PB_TEST_DATABASE=disposable-docker
export BETTER_AUTH_SECRET=disposable-build-check-secret-000000
export DISCORD_CLIENT_ID=test DISCORD_CLIENT_SECRET=test
export NEXT_PUBLIC_APP_URL=http://localhost:3000
export NEXT_TELEMETRY_DISABLED=1
export NODE_OPTIONS=--max-old-space-size-percentage=100
# initdb refuses root; only this throwaway build database runs as postgres.
install -d -o postgres -g postgres /tmp/pb-check-db
runuser -u postgres -- initdb -D /tmp/pb-check-db -A trust --no-locale >/dev/null
trap 'runuser -u postgres -- pg_ctl -D /tmp/pb-check-db -m immediate stop >/dev/null 2>&1 || true; rm -rf /tmp/pb-check-db' EXIT
runuser -u postgres -- pg_ctl -D /tmp/pb-check-db -l /tmp/pb-check-postgres.log -o '-h 127.0.0.1 -p 5432' -w start
createdb -h 127.0.0.1 -U postgres pickleballs_test
bun run db:validate
bun run lint
bunx --no-install next typegen
bun run typecheck
bun run test
bun run test:social
printf 'passed\n' > /app/.checks-passed
