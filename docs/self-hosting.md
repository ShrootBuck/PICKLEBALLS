# Home server deployment

Production moved to the Ubuntu laptop on September 26, 2026. Coolify project
**Infrastructure**, environment **production**, applications **Pickle Balls Web**, **Pickle Balls Worker**, and **Pickle Balls Static Assets**.

| Component | Production location |
| --- | --- |
| Next.js | Coolify `web` container, standalone Node.js server |
| Background jobs | One Coolify `worker` container, pg-boss queue in local Postgres |
| Database | PostgreSQL 18.6, database `pickleballs`, persistent Docker volume |
| Media | Garage 2.1.0, private bucket `pickleballs-media`, persistent data and metadata |
| Public traffic | Cloudflare Tunnel to the laptop's Traefik proxy |
| Administration | Coolify at `http://100.118.70.14:8000` over Tailscale |

`pickle-balls.com` and `*.pickle-balls.com` route to `http://localhost:80` in the
tunnel. HTTPS terminates at Cloudflare; the connection to cloudflared is encrypted.
Public media uses `https://s3.pickle-balls.com` with signed URLs. Postgres and
Garage's admin API have no published host ports or public application routes.
Garage's required auxiliary template hostnames are `garage-web.localhost` and
`garage-admin.localhost`, with no public DNS or tunnel route.

The live Traefik file `/data/coolify/proxy/dynamic/pickleballs-media.yml`
comes from `deploy/traefik-media.yml`. Its higher-priority S3 router bypasses
Coolify's generated gzip middleware and sends `Cache-Control: private, no-store,
no-transform`. Keep this route when updating the proxy: compressing MP4 responses
removed their content length, weakened ETags, and caused Cloudflare cache misses
to return full `200` responses to Safari's `Range: bytes=0-1` requests. Correct
playback returns `206`, `Content-Length: 2`, and `Content-Range: bytes 0-1/…`.
The proxy must share Garage's Docker network; update the service hostname in
this file if Garage is recreated with a different resource ID.

Finalized videos use stable `/api/media/<id>?v=<object-version>` URLs. Next.js
checks membership and streams Garage byte ranges without buffering the file.
Successful versioned responses use `private, max-age=31536000, immutable,
no-transform`, allowing browser caching while bypassing shared CDN caches.
Images and posters already use private year-long caching. Browsers may evict
media or retain only watched ranges; downloaded copies can remain after logout.
Playback tickets, errors, and unversioned video responses remain uncached.

## Deployments

Push to GitHub `main` to deploy. The **Check and deploy** GitHub Actions workflow
runs lint, generated Next.js types, typechecking, unit tests, populated-database
migration/integration tests, and production Docker builds for web and worker.
It rejects edits to previously deployed migration files and a Prisma schema that
does not match the committed migration SQL. Checks use disposable Postgres 18.6
and build-only placeholders, never production credentials.

Only after all checks pass, CI advances `codex/production-web` to the tested
commit. Coolify builds it, runs `prisma migrate deploy`, and replaces web after
readiness succeeds. CI verifies the built page, web commit, and old/new assets,
then advances `codex/production-worker` to the same commit. It waits for the
worker and web to report that commit, then samples both for one minute. GitHub's
deploy job is green only after verification finishes. No manual migration or
Coolify click is needed for an ordinary release.

The deployment branches are automated fast-forward-only pointers. Do not work
on them or push them manually. Deployment jobs are serialized and never canceled
mid-release; a queued job skips itself if a newer `main` commit already exists.
Checks failing before promotion leave production alone. A failure after migration
requires investigation and usually a forward fix; no automatic schema rollback
is attempted. Re-running a job can verify an already-running release, but if
Coolify's build failed, redeploy its existing branch in Coolify or push a fix to
`main` to trigger a new release.

A signed GitHub webhook reaches only
`https://deploy.pickle-balls.com/webhooks/source/github/events/manual`.
Other paths on that hostname return 404; the dashboard remains private.
Coolify builds the repository's Dockerfile with separate `web`, `worker`, and
`assets` targets. Web watches `codex/production-web`; worker watches
`codex/production-worker`. Neither may auto-deploy directly from `main`.
The static asset service only needs redeployment when its Nginx configuration
changes. All three are managed in Coolify.

Web deployments overlap old and new containers. Each new web container applies
its release's Prisma migrations, publishes its immutable build assets, starts
Next.js, and passes `/api/health` (including a database query) before Coolify
stops the old container. Failed health checks keep the previous release serving.
No host port mappings or fixed container names are configured for web.
Next.js receives SIGTERM and has up to 300 seconds to finish active requests.
This avoids deployment restarts, but a single laptop still has hardware,
network, power and operating-system downtime.

Run exactly one worker replica. Its consistent container name makes Coolify
stop the old worker before starting its replacement. Jobs remain in Postgres
and resume/retry after restart. Video concurrency is one per process.

`SOURCE_COMMIT` is baked into each image as `/app/.release-commit` and becomes
Next.js's deployment ID for version-skew detection. CI builds both Docker targets
from the tested source; Coolify builds that same commit with the production build
configuration. Images are not transferred from GitHub to the server.
A persistent `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` is supplied through Coolify
BuildKit secrets. The static service routes `/_next/static` before the web
router and reads `/data/pickleballs/next-static`. New web containers copy their
hashed assets into that shared directory, retaining prior releases for existing
tabs. It contains only public build output, never environment files or uploads.
Older assets are deliberately retained; monitor its disk use before any cleanup.

`/api/health` checks the database and reports the web's baked commit.
`/api/health?release=1` also returns the worker's readiness and baked commit,
using web's server-only `WORKER_HEALTH_URL`. It returns no internal URL, secrets,
or detailed errors. Ordinary container readiness does not depend on the worker,
so the web-first release order cannot deadlock.

### One-time CI setup

1. Seed `codex/production-web` and `codex/production-worker` from their current
   deployed commits. Keep them as ancestors of `main`.
2. In Coolify, change each application's Git branch to its deployment branch.
   Keep auto-deploy and the signed GitHub push webhook enabled. Ensure
   **Advanced > Source commit availability > Available during build** is enabled
   on both apps. Web receives it through BuildKit secrets and worker through build
   arguments. The Dockerfile stamps it during a `RUN` instruction in either case.
3. Set web's runtime `WORKER_HEALTH_URL` to the worker's stable private Docker
   hostname on port 3001. Do not publish this port on the host.
4. Set repository Actions variable `PB_CI_DEPLOY_ENABLED=true`. The workflow's
   deploy job receives `contents: write` only to advance these refs. CI does not
   need Coolify tokens, SSH keys, production database URLs, or a public API.
5. Commit and push the pipeline changes to `main`, then verify its first Actions
   run and the Coolify webhook delivery. Settings alone do not prove the pipeline
   works; the first successful real release is the end-to-end acceptance check.

Builds may use all CPUs available to their host. Next.js uses
`availableParallelism()` for its worker count, and the Docker build allows Node's
heap to grow to 100% of available memory instead of imposing the old 3 GB cap.
This is an upper bound, not a reservation or a guarantee of 100% utilization;
compilation still has serial and I/O-bound stages. Coolify's application resource
limits apply to running containers, not its Docker build process.

Coolify holds runtime secrets. `NEXT_PUBLIC_APP_URL`,
`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `S3_PUBLIC_ENDPOINT`, and the Server Actions key
are also available at build time. The public storage endpoint is embedded in
CSP. Web, worker, Postgres, and Garage share Coolify's private Docker network.
The canonical app origin is `https://pickle-balls.com`; `www` is intentionally
unsupported. Leave `APP_ALLOWED_ORIGINS` empty unless another app origin is
explicitly required. Mutation checks use public configuration rather than the
internal HTTP container URL or untrusted forwarding headers.

```dotenv
PB_SELF_HOSTED=true
BACKGROUND_BACKEND=postgres
WORKER_SCHEDULES_ENABLED=true
S3_ENDPOINT=http://garage-ekp7vnegd1clc0tzy1hvjar2:3900
S3_PUBLIC_ENDPOINT=https://s3.pickle-balls.com
S3_REGION=garage
S3_BUCKET=pickleballs-media
S3_ACCESS_KEY_ID=<bucket-scoped key>
S3_SECRET_ACCESS_KEY=<bucket-scoped secret>
DATABASE_URL=<private Postgres URL>
DIRECT_DATABASE_URL=<same private Postgres URL>
```

Production migrations use `prisma.deploy.config.ts`, which requires
`PB_SELF_HOSTED=true` and permits only `migrate deploy`. Keep `.env` pointed at
local development. Never run `migrate dev` or `db push` against production.

## Verify a rolling deployment

Run `bun scripts/verify-production-deploy.ts --watch` before pushing to main.
It records the current built deployment ID and asset URLs, polls public health,
the sign-in page, and old assets throughout the release, then checks all captured
old and new assets again after a 60-second observation period. It exits nonzero
on any failed check or if no new release is observed within 15 minutes. Without
`--watch`, it performs a single-release smoke check.

Also verify both web and worker report the intended commit and healthy status
in Coolify. The static service does not need a rebuild for ordinary app changes:
the new web container publishes its assets to their shared directory automatically.

This checks sampled HTTP availability and asset continuity, not every user action.
Next.js may reload an old tab when it detects version skew; unsent form/chat text
may be lost. The web's 300-second shutdown allowance covers the AI's 285-second
run limit, but crashes and network failures can still interrupt streams. The
single worker pauses during replacement and retries unfinished durable jobs.
Migrations may break the old release during the overlap; brief errors there are
acceptable. Migrations must never lose data that is still wanted (see AGENTS.md).

## Migration verification

- All 28 source public tables matched destination row counts and ordered row
  hashes after restore. All 25 Prisma migrations were already applied.
- Copied all 955 R2 objects (1,578,319,132 bytes). Every destination object was
  read back and verified by SHA-256, size, and content type.
- Verified public signed multipart upload, CORS preflight, exposed ETag, signed
  download checksums, and rejection of anonymous object access. Garage needs
  separate CORS rules for apex and www, rather than both origins in one rule.
- Verified queue persistence, duplicate suppression, retries, process concurrency,
  and abandoned-job recovery with a disposable database.
- A disposable real-worker video job passed FFmpeg encoding, poster generation,
  database publication, and public signed downloads. Its data was removed.
- Verified a real GitHub push initiated a successful Coolify deployment, public
  apex/www health returned 200, and the existing signed-in browser session and
  migrated video playback worked after DNS cutover.
- All three Trigger cloud schedules are disabled. Local schedules are enabled:
  reconcile hourly (Phoenix), prune daily at 03:30 (Phoenix), recover every five
  minutes (UTC). The OpenRouter credential was validated; a fresh AI generation
  and delivery of a push notification were not part of the migration smoke test.

## Operations and rollback

- Web: `pjd7ddc7afz1fjxsu9veepnx`
- Worker: `jpccsyfelscs72ncmnn98xdh`
- Static assets: `ktxfb3ereojvgf3lbtamrfym`
- Retired Compose application: `wandtzt9k9stel4hkuuymjs8` (auto-deploy disabled)
- Postgres: `e4f3e1knwyipgf90j2xhlnrz`
- Garage service: `ekp7vnegd1clc0tzy1hvjar2`
- Garage container: `garage-ekp7vnegd1clc0tzy1hvjar2`
- Tunnel: `895f9e5c-e4cc-4761-84c3-861b4cda945d`

Garage has one node with a 150 GB placement capacity, not a disk quota or a
replicated second copy. The app key can read/write only the media bucket.
Server credentials and migration artifacts are under root-only
`/data/pickleballs/`. Never commit secrets or print them in logs.

Cloud-resource deletion is being handled separately. Do not rely on Vercel,
Neon, R2 or Trigger as a rollback target: the owner is retiring those services,
and they never mirrored writes made after cutover. Rolling back the web image
in Coolify only works while the older code still matches the current schema.
After a breaking migration, roll forward with a fix instead. Cloudflare DNS and
the Tunnel remain required.

Off-machine backups are intentionally omitted at the owner's request. Docker
volumes survive container redeployment but do not protect against disk failure.
