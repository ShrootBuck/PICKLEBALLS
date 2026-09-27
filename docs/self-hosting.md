# Home server deployment

## Prepared infrastructure (2026-09-26)

Coolify project: **Infrastructure**, environment: **production**. The environment
name does not mean the live application has moved. Vercel, the cloud database,
R2, and Trigger still serve the existing deployment.

| Resource | State |
| --- | --- |
| cloudflared | Existing tunnel, wildcard `*.pickle-balls.com` to the local proxy |
| pickleballs-postgres | PostgreSQL 18.6, database `pickleballs`, private Docker connection, persistent volume |
| pickleballs-media | Garage 2.1.0, private S3 bucket `pickleballs-media`, persistent metadata and data volumes |

Verified on the server: SQL query, healthy containers, no published host ports,
and authenticated S3 PUT/GET/DELETE with byte-for-byte download comparison.
Garage has one storage node with a 150 GB placement capacity. This is neither a
disk quota nor redundant storage. Its app key has read/write permission on only
the media bucket. Credentials are stored under root-only `/data/pickleballs/`;
do not commit them or paste them into logs.

Coolify resource IDs:

- Postgres: `e4f3e1knwyipgf90j2xhlnrz`
- Garage service: `ekp7vnegd1clc0tzy1hvjar2`
- Garage container: `garage-ekp7vnegd1clc0tzy1hvjar2`

## Application configuration

Setting `S3_ENDPOINT` selects generic S3 storage; without it the existing R2
configuration remains active. Supply all S3 credentials together:

```dotenv
PB_SELF_HOSTED=true
S3_ENDPOINT=http://garage-ekp7vnegd1clc0tzy1hvjar2:3900
S3_PUBLIC_ENDPOINT=https://s3.pickle-balls.com
S3_REGION=garage
S3_BUCKET=pickleballs-media
S3_ACCESS_KEY_ID=<bucket-scoped key>
S3_SECRET_ACCESS_KEY=<bucket-scoped secret>
DATABASE_URL=<private Postgres URL from Coolify>
DIRECT_DATABASE_URL=<same private direct Postgres URL>
```

The public S3 endpoint is verified through Cloudflare Tunnel. The app and worker
still need a shared Docker network with Garage. The web browser uses the public endpoint
for signed uploads and downloads; server-side storage and video processing use
the private endpoint. Set the public endpoint at **build time and runtime**:
Next.js bakes the allowed media origin into its CSP headers at build time.

`PB_SELF_HOSTED=true` enables Next.js standalone output. The eventual container
must include `.next/standalone`, `.next/static`, and `public`.

For production migrations, use the explicit container entrypoint, with environment
variables injected by Coolify and no local dotenv files:

```sh
node node_modules/prisma/build/index.js migrate deploy --config prisma.deploy.config.ts
```

This config permits only `migrate deploy` and requires `PB_SELF_HOSTED=true` and
`DIRECT_DATABASE_URL`. Ordinary `prisma.config.ts` retains the loopback-only local
safeguard. Never change `.env` to point at the server or run `migrate dev`/`db push`
against it.

## Remaining before cutover

Migration checks completed on September 26:

- Restored the Neon PostgreSQL 18.6 snapshot into local Postgres. All 28 public
  tables have matching row counts and ordered row hashes. All 25 Prisma
  migrations are already applied.
- The Postgres worker queue passed a real database smoke test for durable
  restart, duplicate suppression, retry, local concurrency, and recovery after
  an abandoned attempt. Run exactly one worker replica and stop the old worker
  before starting a replacement. Local concurrency limits are per process.
- Production R2 copying uses a temporary, bucket-scoped read-only token with a
  24-hour lifetime. Each destination object is read back and checked by SHA-256,
  size, and content type. Completed: **955 objects, 1,578,319,132 bytes**, all
  verified. Source objects were not modified or deleted.
- The production Next.js web image and FFmpeg worker image build successfully
  on the laptop. Application deployment and production traffic cutover remain
  pending.
- Public `https://s3.pickle-balls.com` passed signed multipart PUT, preflight
  CORS, exposed ETag, signed GET with checksum verification, and anonymous-access
  rejection. Use separate CORS rules for each origin; Garage 2.1.0 returned an
  invalid comma-separated Allow-Origin header when both origins shared a rule.
  The template's required auxiliary URLs use `garage-web.localhost` and
  `garage-admin.localhost`, with no public DNS or tunnel route. Only the S3
  hostname is reachable through the public wildcard tunnel.

1. Deploy the built Next.js and worker images as Coolify resources, with exactly
   one worker replica. Configure the runtime secrets and attach both to the
   private Postgres and Garage networks. Keep worker schedules disabled until
   cutover.
2. Validate the running application: login, media display, browser uploads,
   video processing, AI reads, push notifications, and scheduled recovery.
3. The user authorized treating production as frozen for this migration. Before
   changing traffic, confirm the snapshot still represents the intended state,
   disable the old schedulers, then enable the local scheduler.
4. Retain cloud resources for rollback until the new deployment is verified.
   Cloud cleanup is a separate later step.

Off-machine backups are intentionally omitted at the owner's request. Persistent
Docker volumes survive redeployment but do not protect against disk failure.
