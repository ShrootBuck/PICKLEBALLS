# Trigger.dev

Project: `proj_xyssxtuhmwrlrkqotyxb`.

Run `bun run dev:trigger` alongside `bun run dev`. The development API key belongs in `.env`. Development tasks run on your machine and use the local database on port 51218. The CLI is already authenticated.

## Jobs

- `assess-proof`: proof photo AI reads, with retries and a final failure status.
- `read-screen-time`: screenshot extraction and saved readings. The API still waits for the reading so the existing confirmation UI works.
- `notification`: accepts proof-submitted, proof-reviewed, reply-received, or push payloads. Event runs create inbox notifications with per-recipient database deduplication and enqueue push runs on the same task. Handles push delivery with retries and stale subscription removal. Retries use the same notification tag, but delivery is at least once, so a device may receive another delivery attempt.
- `screen-time-reminders`: Sunday at 10 a.m. Phoenix time.
- `reconcile-missed-tasks`: daily at midnight Phoenix time, processing each circle directly in batches. Failures retry the nightly run; completed updates are skipped.

Schedules are production-only.

## Video uploads and processing

New videos use multipart R2 uploads, with 32 MiB chunks, per-chunk retries, visible upload progress, and a 5 GiB input limit. MP4, MOV, WebM, MKV, AVI, M4V, MPEG and transport-stream inputs are accepted; FFprobe verifies the actual video. There is no duration limit in the upload policy. Keep the tab open until uploading finishes. Chunk retries resume within the same tab; a browser restart requires selecting and uploading the file again.

- `process-media`: FFprobe inspection, FFmpeg encoding, a Sharp WebP poster, output verification, and deletion of the original after the ready record is saved. Uses `medium-2x`, two concurrent encodes, three attempts, and a 24-hour compute safety limit per attempt. Media is streamed from R2 through FFmpeg into a multipart R2 output, without buffering the whole file or using worker disk for the video.
- The single playback rendition is H.264/AAC MP4, CRF 20, capped at 8 Mbps video and 192 kbps stereo audio, up to 1080p (1920×1080 landscape or 1080×1920 portrait) and 60 fps. Smaller inputs are not enlarged. Rotation and aspect ratio are preserved; HDR is tone-mapped to SDR. The MP4 is fragmented with playback metadata first and two-second keyframes. It is a single quality file, with no HLS playlist or adaptive quality ladder.
- `publish-media-proof`: waits durably for all attachments, then creates the proof and claims its media in one transaction. The private `PendingProof` reservation records the acceptance time for deadline checks. Feed/story time starts at publication. Retried publication returns the same proof.
- `recover-media-posts`: every five minutes, retries dispatch for saved submissions and retries original-file cleanup. Failed encodes keep the original for the user's retry. The owner can see progress, retry, or remove a failed submission; friends see only published proof.
- Photos retain the existing Sharp resize/WebP pipeline. Video replies wait for processing before posting; the background publication flow applies to proof/story submissions.

Video uploads require `TRIGGER_SECRET_KEY`, including local development. Run the app and `bun run dev:trigger` together. The worker image installs FFmpeg with the build extension. Locally, install an FFmpeg build with libx264, AAC, PNG, zscale and tonemap support (for example, Homebrew's `ffmpeg-full`); `FFMPEG_PATH` and `FFPROBE_PATH` can point to that build. Plain Homebrew FFmpeg may omit zscale, which is required for HDR phone footage.

R2 browser CORS must allow the app origin, `PUT`, `GET` and `HEAD`, and the upload's content headers. Video bytes bypass Next.js: the app signs chunk uploads and authenticated playback URLs. Existing private media authorization also protects poster and playback metadata endpoints. Bucket credentials must permit multipart create/list/complete/abort plus object read/write/delete. Configure expiry of abandoned staging objects and incomplete multipart uploads at the bucket level.

Apply the migration before deploying the new app and worker together. It expands media byte counts to BIGINT and adds processing metadata and private pending submissions. Existing media remains readable; this change does not backfill old videos.

Validation: `bun test`, `bun run test:social` (Docker and FFmpeg required), `bun run typecheck`, `bun run lint`, `bun run build`, and `npx trigger.dev@4.5.16 deploy --dry-run`. `bun scripts/test-social.ts --serve --video` adds two encoded video attachments to Eddie's disposable story for browser checks.

The web app uses Trigger.dev when `TRIGGER_SECRET_KEY` is present. Without it, existing local execution remains available. Proof completion is observed through the existing response stream; the task survives a disconnected client or an expired web request. Screen-time callers can retry after a lost response and recover the saved reading. Authorization remains in the API routes. Task payloads contain IDs, not image bytes or credentials.

## Vercel pipeline (recommended)

This repository deploys through Vercel and has no GitHub Actions workflow. In Trigger.dev project Settings, connect Vercel project `pickleballs` and GitHub repository `ShrootBuck/PICKLEBALLS`. The Trigger install command is `bunx bun@1.4.0 install --frozen-lockfile`, the pre-build command is `bun run db:generate`, and the config path is `trigger.config.ts`. The pinned installer is required because the build image includes an older Bun that cannot read lockfile version 2.

The native integration deploys tasks on Vercel deployments, matches app and worker commit versions, and syncs the appropriate `TRIGGER_SECRET_KEY` into Vercel. No `TRIGGER_ACCESS_TOKEN` is needed for this integration. Review environment sync to include only the worker dependencies listed below. Vercel variables marked Sensitive cannot be read by the integration. `scripts/sync-trigger-env.ts` runs during the production Vercel build and copies only the worker allowlist directly to Trigger.dev as secret variables. Values are never printed.

For custom GitHub Actions instead, the deploy step uses a Trigger personal access token stored as the GitHub Actions secret `TRIGGER_ACCESS_TOKEN`. That token is distinct from runtime API keys and does not belong in Vercel.

Reference: https://trigger.dev/docs/vercel-integration

## Production rollout

1. Configure the production Trigger.dev environment with its production database URL, `OPENROUTER_API_KEY`, R2 credentials (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`), VAPID keys and subject, and `NEXT_PUBLIC_APP_URL`. Keep production database credentials out of `.env`. Do not sync local environment files into production.
2. Run `bun run deploy:trigger`. Prisma Client is generated before bundling. The Trigger worker resolves `server-only` using the `react-server` condition and externalizes Sharp.
3. Set the production environment's `TRIGGER_SECRET_KEY` in Vercel. Never use the development key there.
4. After verifying the Trigger production schedules, set `TRIGGER_SCHEDULES_ENABLED=true` in Vercel. Legacy cron routes then acknowledge without executing. The Vercel cron definitions have been removed after confirming both Trigger schedules are active.

GitHub repository and Vercel project are connected. Pushes to `main` deploy the app and worker through the native integration. The build sync step handles sensitive worker credentials. The development key remains local; Vercel receives its production key from the integration.
