# Trigger.dev

Project: `proj_xyssxtuhmwrlrkqotyxb`.

Run `bun run dev:trigger` alongside `bun run dev`. The development API key belongs in `.env`. Development tasks run on your machine and use the local database on port 51218. The CLI is already authenticated.

## Jobs

- `read-screen-time`: extracts the screenshot and automatically saves a valid weekly entry. Requires Trigger.dev, including local development. The API returns a run ID; the UI can check its status or recover it on return.
- `notification`: delivers push notifications for existing inbox rows. Proof, review, and reply mutations create deduplicated inbox rows in their database transaction. Only after commit do they enqueue push jobs. Push delivery retries failures and removes stale subscriptions; delivery is at least once, with the same notification tag on retries.
- `reconcile-missed-tasks`: hourly on the hour, processing each circle in batches of 25. Tasks that are not verified 24 hours after creation become missed, including tasks with pending reviews or media still processing. Already verified tasks stay verified. The API and UI enforce the deadline immediately; persisted status and activity events catch up on the hourly run. Failures retry the run, and completed updates are skipped.

Schedules are production-only. The timeblock editor continues to stream and save its interactive AI conversation inside Next.js. Proof-photo AI descriptions and screen-time reminder notifications have been removed. The in-app screen-time banner remains.

## Video uploads and processing

New videos use multipart R2 uploads, with 8 MiB chunks, per-chunk retries, visible upload progress, and a 5 GiB input limit. MP4, MOV, WebM, MKV, AVI, M4V, MPEG and transport-stream inputs are accepted; FFprobe verifies the actual video. There is no duration limit in the upload policy. Keep the tab open until uploading finishes. Chunk retries resume within the same tab; a browser restart requires selecting and uploading the file again.

- `process-media`: FFprobe inspection, FFmpeg encoding, a Sharp WebP poster, output verification, and deletion of the original after the ready record is saved. Uses `large-1x`, two concurrent encodes, three attempts, and a 24-hour compute safety limit per attempt. The MP4 streams from R2 through FFmpeg into a multipart R2 output. HLS uses bounded temporary segment files, uploaded and removed in batches; whole videos are never buffered in memory or retained on worker disk.
- Playback includes adaptive HLS (360p, 720p, and source-sized up to 1080p) plus an H.264/AAC MP4 fallback. Lower renditions are capped at 30 fps; the largest preserves up to 60 fps. See [video encoding and delivery](media-delivery.md) for settings, private edge caching, deployment, backfill and maintenance.
- `publish-media-proof`: waits durably for all attachments, then creates the proof and claims its media in one transaction. The private `PendingProof` reservation records the acceptance time for upload deadline checks. Timeline time starts at publication. Retried publication returns the same proof. Encoding does not extend the 24-hour verification window: a timely submission can finish publishing into history after expiry, but cannot revive or auto-verify an expired task.
- `recover-media-posts`: every five minutes, retries dispatch for saved submissions and retries original-file cleanup. Failed encodes keep the original for the user's retry. The owner can see progress, retry, or remove a failed submission; friends see only published proof.
- Photos retain the existing Sharp resize/WebP pipeline. Video replies wait for processing before posting; the background publication flow applies to proof submissions.

Video uploads require `TRIGGER_SECRET_KEY`, including local development. Run the app and `bun run dev:trigger` together. The worker image installs FFmpeg with the build extension. Locally, install an FFmpeg build with libx264, AAC, PNG, zscale and tonemap support (for example, Homebrew's `ffmpeg-full`); `FFMPEG_PATH` and `FFPROBE_PATH` can point to that build. Plain Homebrew FFmpeg may omit zscale, which is required for HDR phone footage.

R2 browser CORS must allow the app origin, `PUT`, `GET` and `HEAD`, and the upload's content headers. Video bytes bypass Next.js: the app signs chunk uploads and authenticated playback URLs. Existing private media authorization also protects poster and playback metadata endpoints. Bucket credentials must permit multipart create/list/complete/abort plus object read/write/delete. Configure expiry of abandoned staging objects and incomplete multipart uploads at the bucket level.

Apply the migration before deploying the new app and worker together. It expands media byte counts to BIGINT and adds processing metadata and private pending submissions. Existing media remains readable; existing videos can be upgraded with the bounded backfill in [video encoding and delivery](media-delivery.md).

Validation: `bun test`, `bun run test:social` (Docker and FFmpeg required), `bun run typecheck`, `bun run lint`, `bun run build`, and `npx trigger.dev@4.5.16 deploy --dry-run`. `bun scripts/test-social.ts --serve --video` adds two encoded video attachments to Eddie's disposable timeline for browser checks.

Screen-time AI reads and video processing require `TRIGGER_SECRET_KEY`. Push delivery uses Trigger.dev when configured and retains direct local delivery without a worker. Authorization remains in the API routes. Task payloads contain IDs, not image bytes or credentials.

Retired proof-description columns and the screen-time notification preference remain in PostgreSQL for compatibility with older running deployments, but are `@ignore`d in Prisma and are not exposed or used by the app. Historical enum values remain readable; retired reminder notifications are excluded from inbox queries, counts, and push delivery.

## Vercel pipeline (recommended)

This repository deploys through Vercel and has no GitHub Actions workflow. In Trigger.dev project Settings, connect Vercel project `pickleballs` and GitHub repository `ShrootBuck/PICKLEBALLS`. The Trigger install command is `bunx bun@1.4.0 install --frozen-lockfile`, the pre-build command is `bun run db:generate`, and the config path is `trigger.config.ts`. The pinned installer is required because the build image includes an older Bun that cannot read lockfile version 2.

The native integration deploys tasks on Vercel deployments, matches app and worker commit versions, and syncs the appropriate `TRIGGER_SECRET_KEY` into Vercel. No `TRIGGER_ACCESS_TOKEN` is needed for this integration. Review environment sync to include only the worker dependencies listed below. Vercel variables marked Sensitive cannot be read by the integration. `scripts/sync-trigger-env.ts` runs during the production Vercel build and copies only the worker allowlist directly to Trigger.dev as secret variables. Values are never printed.

For custom GitHub Actions instead, the deploy step uses a Trigger personal access token stored as the GitHub Actions secret `TRIGGER_ACCESS_TOKEN`. That token is distinct from runtime API keys and does not belong in Vercel.

Reference: https://trigger.dev/docs/vercel-integration

## Production rollout

1. Configure the production Trigger.dev environment with its production database URL, `OPENROUTER_API_KEY`, R2 credentials (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`), VAPID keys and subject, and `NEXT_PUBLIC_APP_URL`. Keep production database credentials out of `.env`. Do not sync local environment files into production.
2. Run `bun run deploy:trigger`. Prisma Client is generated before bundling. The Trigger worker resolves `server-only` using the `react-server` condition and externalizes Sharp.
3. Set the production environment's `TRIGGER_SECRET_KEY` in Vercel. Never use the development key there.
4. After verifying the Trigger production schedules, set `TRIGGER_SCHEDULES_ENABLED=true` in Vercel. The legacy reconciliation cron route then acknowledges without executing. The screen-time reminder cron route is removed; Vercel has no cron definitions. Verify the removed `screen-time-reminders` schedule is inactive when deploying this change.

GitHub repository and Vercel project are connected. Pushes to `main` deploy the app and worker through the native integration. The build sync step handles sensitive worker credentials. The development key remains local; Vercel receives its production key from the integration.
