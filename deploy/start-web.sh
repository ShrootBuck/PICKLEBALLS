#!/bin/sh
set -eu
# Apply this release's migrations before it can pass readiness.
node deploy/migrate.mjs
# Hashed assets from previous releases remain available to open browser tabs.
# Coolify mounts this directory into the dedicated static-assets service too.
cp -an /app/release-static/. /app/.next/static/
exec node server.js
