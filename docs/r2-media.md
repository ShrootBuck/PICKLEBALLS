# R2 media rollout

Postgres remains the relational database. R2 stores photos and videos in a private bucket. Existing `TaskProofImage.data` bytes stay available during rollout. Discord avatar URLs remain managed by Discord; this migration covers all uploaded app images.

## Configure first

1. In Cloudflare, activate R2 and create separate private buckets for production and development. Do not enable public access.
2. Create S3 API credentials scoped to object read/write on the chosen bucket. Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET` in Vercel; put development credentials in local `.env`. Never move the production database URL into `.env`.
3. Configure bucket CORS with the exact app origins. Development uses its own bucket and localhost origin:

```json
[{"AllowedOrigins":["https://YOUR_APP_DOMAIN"],"AllowedMethods":["PUT","GET","HEAD"],"AllowedHeaders":["content-type"],"ExposeHeaders":["ETag"],"MaxAgeSeconds":3600}]
```

4. Add a lifecycle rule to expire **only `staging/`** objects after one day. Never expire `media/`, `proofs/`, or `legacy-proofs/`.
5. Deploy the committed SQL migration through Vercel's `prisma migrate deploy`. It adds metadata and makes legacy bytes nullable; it does not delete existing photos. Configure R2 before deploying the new upload UI.

Browser uploads use signed PUT URLs; finalization verifies the size, decodes and sanitizes photos, checks video container signatures, then writes a separate immutable key. MP4/MOV/WebM are accepted up to 50 MB; codec playback depends on the browser. There is no transcoding. AI assesses the first photo only, or explicitly defers video-only proof to human review. A signature check is not a complete video decode or malware scan.

Reads require current squad membership and a live parent post. They redirect to an hour-long signed URL so video range requests work directly against R2. These URLs are bearer links until expiry. Deleting a reply removes new access immediately, but issued links remain valid until expiry. Objects are retained; automatic deletion of permanent objects is intentionally not part of this rollout. Abandoned finalized uploads may also remain and should be included in a later orphan cleanup, not an indiscriminate bucket lifecycle rule.

## Copy, verify, then prune

Back up the database first. The script requires an explicit env file and ignores implicitly loaded database/R2 credentials. Store production credentials in the gitignored `.env.production.local` backup, including its R2 settings. Never run `migrate dev` against production.

```sh
# Inventory only; no object or database writes.
bun scripts/migrate-media-to-r2.ts --env-file .env.production.local

# Copy every legacy photo and verify a full read-back SHA-256 + byte count.
# Only then set its objectKey. Keep original database bytes for rollback.
bun scripts/migrate-media-to-r2.ts --env-file .env.production.local --apply

# After checking old photos and AI assessment in the deployed app:
# re-verify each remote object before clearing its database bytes.
bun scripts/migrate-media-to-r2.ts --env-file .env.production.local --apply --prune
```

The copy is bounded to 20 rows per batch, resumable and idempotent. Deterministic legacy keys prevent duplicate objects on retries. A failed copy/read-back never clears source data; a compare-and-set prevents switching a concurrently changed row. Deleted proofs cannot be recreated by the script. Do not prune until the new reader is deployed and verified. Rollback to pre-R2 code is only possible before new R2-only uploads; otherwise roll forward or restore objects to database bytes first.

Migration output reports the remaining database photos; after pruning it should be zero. Database disk usage may not shrink immediately because of Postgres storage reclamation. R2 credentials and a real bucket are required to verify production upload/CORS, playback, and migration end to end.

References: [Cloudflare presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) and [bucket CORS](https://developers.cloudflare.com/r2/buckets/cors/).
