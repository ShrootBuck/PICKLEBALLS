# Video encoding and delivery

New uploads produce an H.264/AAC MP4 fallback and an adaptive HLS ladder. The normalized source is capped at 1080p/60 fps, CRF 22, 6 Mbps peak video and 128 kbps stereo audio. Smaller inputs are not enlarged. Rotation, aspect ratio and HDR-to-SDR conversion remain supported. Lower renditions target 360p (800 kbps) and 720p (2.5 Mbps), capped at 30 fps. Only sizes below the normalized source are encoded. The highest HLS rendition remuxes the normalized MP4 without another lossy encode.

FFmpeg uses two-second closed GOPs. HLS segments are independently decodable MPEG-TS files. FFmpeg atomically renames completed temporary segments. The uploader pauses the encoder while sending batches of at most three segments to R2, then deletes those local files before resuming. Each segment is capped at 16 MiB. Slow storage cannot accumulate a complete video on worker disk. VOD playlists and their measured peak/average bandwidth are published last. Output durations and the presence of every referenced segment are checked before the database pointer changes. Failed attempts retain the source and clean their unpublished outputs. The task runs on `large-1x` (4 vCPUs/8 GiB), with at most two concurrent jobs. Encoding uses `fast` instead of `medium`; the MP4 encode uses four threads and lower renditions two each.

The player loads hls.js only when needed. Safari uses native HLS. Other supported browsers start with the smallest rendition and adapt to bandwidth and player dimensions. Nearby, active slides preload a small buffer; inactive slides detach. Data Saver and very slow connections skip speculative segment loading. HLS errors fall back to MP4, and unrecoverable failures show Retry. Playback tickets refresh before expiry. Leaving the viewport or hiding the document pauses playback. Only one player plays at a time.

## Delivery modes

With no `MEDIA_CDN_ORIGIN`, authorized Next.js endpoints rewrite the small playlists to signed R2 URLs. Video bytes bypass Vercel. R2 browser CORS must permit the application origin, `GET`, `HEAD`, `PUT`, and the `Range` request header. Expose `Content-Length`, `Content-Range`, `Accept-Ranges`, and `ETag`. Native video used to hide some CORS issues; hls.js fetches require CORS to be configured correctly.

With `MEDIA_CDN_ORIGIN` and `MEDIA_CDN_SECRET`, playback uses the worker in `infra/media-worker`. Tickets expire after six hours and authorize only one immutable rendition directory. The worker checks the signature and expiry **before every cache lookup**. Raw immutable objects share an internal edge cache across authorized viewers. Playlists are rewritten with the caller's ticket after that lookup. Public responses use `private, no-store`, so no outer shared cache can bypass authorization. Access already granted by a ticket lasts until its expiry; membership is checked again at renewal. The R2 bucket remains private.

## Rollout

Production infrastructure is configured: `media.pickle-balls.com` serves the private `pickleballs-media` bucket, and Vercel Production has `MEDIA_CDN_ORIGIN` and the matching secret. R2 CORS includes range requests and streaming response headers; incomplete multipart uploads expire after one day. Signed manifests, segments, byte ranges, CORS and unauthorized access were verified against the live Worker with disposable fixtures.

Push to `main` deploys both Vercel and Trigger.dev through their existing Git integrations. Trigger's pre-build command is `bun run db:generate && bun scripts/wait-for-database-migrations.ts`. Its secret `TRIGGER_BUILD_MIGRATION_CHECK_DATABASE_URL` supplies the migration check connection. The check only reads migration status and waits up to ten minutes for Vercel's migrations. The Vercel build queues up to 25 legacy video upgrades after a successful application build, pinned to the matching Git commit's worker deployment. There were 24 eligible production videos at setup. Preview builds skip this maintenance. Failed backfills retain their existing MP4 and can be replayed from Trigger.dev.

The steps below are the manual setup and recovery procedure for another environment:

1. Deploy the additive `adaptive_video` migration with the normal Vercel `migrate deploy` flow. Existing workers and the old application tolerate the nullable column.
2. Deploy the updated Trigger.dev worker (`bun run deploy:trigger`) and application. New uploads now include HLS. Existing files retain MP4 playback until backfilled.
3. In `infra/media-worker/wrangler.jsonc`, set the existing private bucket name, exact app origin, and a custom-domain route in your Cloudflare zone. Use a custom domain, not a temporary preview or `workers.dev`, for the Cache API.
4. Authenticate Wrangler to that Cloudflare account. Generate a dedicated random secret of at least 32 characters. Set it using `bunx wrangler secret put MEDIA_CDN_SECRET --config infra/media-worker/wrangler.jsonc`, and store the same value as `MEDIA_CDN_SECRET` in Vercel. Never put it in source control or a public environment variable.
5. Deploy with `bunx wrangler deploy --config infra/media-worker/wrangler.jsonc`. Verify signed playback and unauthorized denial on the custom domain. Keep the public R2 endpoint disabled. Do not add a cache rule that overrides the worker's private response headers.
6. Set `MEDIA_CDN_ORIGIN=https://<worker-custom-domain>` in Vercel and redeploy the application so its CSP allows that origin. It is not needed by the encoding worker.
7. Backfill in bounded batches, keeping new uploads ahead of maintenance:

   ```sh
   bun scripts/backfill-adaptive-media.ts --production --limit=25
   bun scripts/backfill-adaptive-media.ts --production --limit=25 --apply
   ```

   These commands explicitly load `.env.production.local` only with `--production`. Without it they use the local `.env`. Dry run is the default. They queue jobs, they do not wait for completion. Review Trigger.dev run results before the next batch. Duplicate dispatch is suppressed for 24 hours; a failed run can be replayed in Trigger.dev or dispatched again after that TTL. The current playable file remains available during migration, including on failure. Old URLs remain valid; old assets are not immediately deleted.

## Operations and rollback

- Configure R2 to abort incomplete multipart uploads after one day. Do not apply a blanket expiry rule to published `media/` objects.
- Normal failures clean their outputs. Hard-killed workers and replaced old versions can leave unreferenced objects. `bun scripts/cleanup-media-encodes.ts --production` reports only known encoder assets older than seven days whose generation is no longer referenced by a media record. Review the count, then add `--apply` to remove them. Run this maintenance periodically. It never scans staging/legacy layouts for deletion.
- Watch Trigger.dev failures, encode runtime, queue delay and R2/worker error rates. For playback QA measure click-to-first-frame, rebuffering and seeking on throttled connections. Do not log signed URLs or request query strings in custom analytics. Worker invocation logging is disabled for that reason.
- Removing the CDN environment variables and redeploying falls back to authorized playlists with direct R2 delivery. Keeping the nullable schema column is safe if application/worker code is rolled back. MP4 fallback is retained for all new encodes.
- The adaptive ladder adds storage and compute. Cache hits reduce repeated origin reads but each segment request still invokes the Worker. There is no promise of Instagram-scale throughput without traffic measurements, capacity planning and load testing.

## Verification

`bun test` exercises signatures, warm-cache authorization, ranges, playlist confinement, landscape/portrait/rotated sources, independent segment decoding, seeking and failed writes. `bun scripts/test-social.ts --media-only` runs multipart, database publication, backfill and cleanup-failure regressions against disposable Postgres and storage. Add `--serve --video` for a browser fixture with one HLS and one legacy MP4 attachment at `http://localhost:3318/login`. With the fixture running, use `bun scripts/test-media-browser.ts` and `bun scripts/test-media-browser.ts --webkit` (install browsers with `bunx playwright install chromium webkit`). These assert actual adaptive playback, preloading, seeking, authorization, viewer transitions, legacy fallback, and recovery from rejected manifests. The WebKit check reports the existing unrelated `PostTimestamp` hydration mismatch separately. `bun run typecheck`, `bun run lint`, `bun run build`, Trigger.dev's deploy dry-run and Wrangler's deploy dry-run check both deployable bundles.
