# Video encoding and delivery

Each upload produces one H.264/AAC MP4. Resolution, frame rate and frame timing pass through unchanged (`-fps_mode passthrough`), so 4K, 120/240 fps and variable-frame-rate time-lapses keep every frame. The only rate control is a 10 Mbps peak video ceiling (`-maxrate 10M -bufsize 20M`). x264 chooses its default quality (CRF 23), preset, profile, level and keyframe placement within that ceiling. Audio is 128 kbps stereo AAC. Rotation is applied, pixels are made square, dimensions are rounded down to even numbers and HDR is tone-mapped to SDR. Metadata such as location is stripped.

Very demanding sources are playable only where the device can decode them. For example, 4K at 120 fps or more needs H.264 level 6.x, which many phone hardware decoders do not support.

FFmpeg writes a regular MP4 with the index at the front (`+faststart`) to worker disk, then the file is uploaded to R2 with a multipart upload. Browsers can start playback and seek with range requests before the download finishes. The uploaded file is probed and its duration checked before the database pointer changes. Failed attempts retain the source and clean their unpublished outputs. The task runs on `large-1x` (4 vCPUs/8 GiB), with at most two concurrent jobs, and x264 is limited to four threads.

The player is a native `<video>` that loops. A playback ticket from `/api/media/<id>?playback=1` supplies a signed R2 URL valid for six hours; it refreshes before expiry, and a failed load renews it once before showing Retry. Nearby, active slides load metadata; Data Saver and very slow connections skip that preload. Leaving the viewport or hiding the document pauses playback. Only one player plays at a time.

## Delivery

Video bytes go directly from private R2 to the browser using signed URLs and bypass Vercel. R2 browser CORS must permit the application origin, `GET`, `HEAD`, `PUT`, and the `Range` request header. Expose `Content-Length`, `Content-Range`, `Accept-Ranges`, and `ETag`. Incomplete multipart uploads expire after one day.

Push to `main` deploys both Vercel and Trigger.dev through their existing Git integrations. Trigger's pre-build command is `bun run db:generate && bun scripts/wait-for-database-migrations.ts`. Its secret `TRIGGER_BUILD_MIGRATION_CHECK_DATABASE_URL` supplies the migration check connection. The check only reads migration status and waits up to ten minutes for Vercel's migrations.

## Operations

- Configure R2 to abort incomplete multipart uploads after one day. Do not apply a blanket expiry rule to published `media/` objects.
- Normal failures clean their outputs. Hard-killed workers can leave unreferenced objects, and earlier encodes left HLS playlists and segments under `hls/` that are no longer read. `bun scripts/cleanup-media-encodes.ts --production` reports known encoder assets older than seven days that are unreferenced or HLS. Review the count, then add `--apply` to remove them. It never scans staging/legacy layouts for deletion.
- Watch Trigger.dev failures, encode runtime, queue delay and R2 error rates. Do not log signed URLs or request query strings in custom analytics.

## Verification

`bun test` encodes landscape, 1080p 240 fps, portrait and rotated sources, and checks preserved resolution, frame count, duration, faststart layout, seeking, posters and cancellation. `bun scripts/test-social.ts --media-only` runs multipart, database publication and cleanup-failure regressions against disposable Postgres and storage. Add `--serve --video` for a browser fixture at `http://localhost:3318/login`. With the fixture running, use `bun scripts/test-media-browser.ts` and `bun scripts/test-media-browser.ts --webkit` (install browsers with `bunx playwright install chromium webkit`). These assert MP4 playback, looping, seeking, authorization, viewer transitions and recovery from a rejected video URL. The WebKit check reports the existing unrelated `PostTimestamp` hydration mismatch separately. `bun run typecheck`, `bun run lint`, `bun run build` and Trigger.dev's deploy dry-run check the deployable bundles.
