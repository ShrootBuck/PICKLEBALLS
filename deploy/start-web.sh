#!/bin/sh
set -eu
# Apply this release's additive migrations before it can pass readiness.
node node_modules/prisma/build/index.js migrate deploy --config prisma.deploy.config.ts
# Hashed assets from previous releases remain available to open browser tabs.
# Coolify mounts this directory into the dedicated static-assets service too.
cp -an /app/release-static/. /app/.next/static/
exec node server.js
