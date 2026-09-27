# Home server deployment

Production moved to the Ubuntu laptop on September 26, 2026. Coolify project
**Infrastructure**, environment **production**, application **Pickle Balls**.

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

## Deployments

Push to GitHub `main` to deploy. A signed GitHub webhook reaches only
`https://deploy.pickle-balls.com/webhooks/source/github/events/manual`.
Other paths on that hostname return 404; the dashboard remains private.
Coolify pulls the public repository and builds `compose.production.yml`.
The worker runs Prisma migrations before starting. The web container waits for
worker health, then checks `/api/health`, which verifies its database connection.

This single-machine Compose setup briefly restarts the app during deployment.
Run exactly one worker replica, and stop the old worker before replacing it:
video and queue concurrency limits are per process. Jobs are stored in Postgres
and resume/retry after restart. Video concurrency is one.

Coolify holds the runtime secrets. `NEXT_PUBLIC_APP_URL`,
`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, and `S3_PUBLIC_ENDPOINT` are also build arguments.
The S3 public endpoint is embedded in the browser content security policy.
The app and worker join the private Postgres and Garage Docker networks.

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

- Application: `wandtzt9k9stel4hkuuymjs8`
- Postgres: `e4f3e1knwyipgf90j2xhlnrz`
- Garage service: `ekp7vnegd1clc0tzy1hvjar2`
- Garage container: `garage-ekp7vnegd1clc0tzy1hvjar2`
- Tunnel: `895f9e5c-e4cc-4761-84c3-861b4cda945d`

Garage has one node with a 150 GB placement capacity, not a disk quota or a
replicated second copy. The app key can read/write only the media bucket.
Server credentials and migration artifacts are under root-only
`/data/pickleballs/`. Never commit secrets or print them in logs.

Vercel, Neon, R2, and Trigger resources are retained for later cleanup.
`vercel.json` disables new automatic Vercel deployments. The old apex CNAME was
`3a9a0429cb869cdb.vercel-dns-017.com` (DNS only). Cloud data is the migration
snapshot, not a mirror of new local writes. A rollback after new writes requires
reconciling those writes before switching traffic and schedules back.

Off-machine backups are intentionally omitted at the owner's request. Docker
volumes survive container redeployment but do not protect against disk failure.
