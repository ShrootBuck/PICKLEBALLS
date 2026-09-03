# Pickle Balls

Pickle Balls is a private schoolwork accountability app for a small circle. It is
not a pickleball tracker. Each person can set up to ten tasks per Phoenix day,
post photo proof, and get one peer approval or one challenge to verify. One
approval from someone else verifies a proof.

## Stack

- Next.js 16 and React 19
- Prisma ORM 7 with PostgreSQL
- Better Auth 1.7.2 with invite-gated Discord OAuth
- AI SDK 7 with `meta/muse-spark-1.3-contributor` through OpenRouter
- shadcn/ui Base Nova with Base UI primitives
- Biome, TypeScript, Bun tests, Sharp image sanitization

## Local setup

```bash
bun install
cp .env.example .env
bun run db:generate
bun run db:push
bun run dev
```

The `Pickle Balls` circle is created automatically on first owner sign-in.
`bun run db:reset` destroys all current database data and pushes the schema.
Run it only when a reset is intentional.

## Discord authentication

Create a Discord application and configure these redirect URLs:

- Local: `http://localhost:3000/api/auth/callback/discord`
- Production: `https://YOUR_DOMAIN/api/auth/callback/discord`

Set `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and the first owner's immutable
Discord ID as `BOOTSTRAP_DISCORD_USER_ID`. The bootstrap identity gets the OWNER
membership. All other new identities need an unused `/join/[token]` link made by
the owner. Returning members use `/sign-in`.

Better Auth stores seven-day sessions, database rate limits, encrypted OAuth
tokens, and Discord provider-account identity. Discord display names, usernames,
and avatars refresh on sign-in. Phone-only Discord accounts get a non-routable
placeholder email because the auth user table requires a unique email.

## AI behavior

The app uses AI SDK 7 `generateText` with bounded `Output.object` schemas for:

- advisory task-proof comparison
- unblock coaching for check-ins

Every request uses `meta/muse-spark-1.3-contributor`, disables fallbacks, requires supported parameters, times out after 60 seconds, and retries
once. AI never resolves proof. A friend does. Metadata-only run logs are stored;
prompts and images are not logged.

## Storage

Proof images are decoded, auto-rotated, stripped of metadata,
bounded to 2048 pixels, and re-encoded as WebP before Postgres storage. Image
routes require circle membership and send private caching plus `nosniff`.

App history is kept indefinitely. This includes tasks, proofs,
check-ins, replies, activity, images, and AI run metadata.
The app does not run an age-based purge.

Vercel calls `/api/cron/reconcile` daily with the configured `CRON_SECRET`
bearer token. That job only marks overdue tasks as missed; it does not delete
data.

## Checks

```bash
bun run db:validate
bun run db:generate
bun run test
bun run audit:ui
bun run lint
bun run typecheck
bun run build
```

Browser tests require a disposable Postgres database whose database name
contains `test`:

```bash
TEST_DATABASE_URL="postgresql://.../pickle_balls_test" bun run test:browser
```

The browser-test setup force-resets only that guarded test database and seeds
four Discord-style sessions. It never uses `DATABASE_URL` as the reset target.
