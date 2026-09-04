# Pickle Balls

Pickle Balls is a private schoolwork accountability app for a small circle. It is
not a pickleball tracker. Each person can set as many tasks as they want per Phoenix day,
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
bun run db:dev        # start isolated dev + test Prisma Postgres instances
bun run db:generate
bun run db:migrate    # apply all migrations to the local database
bun run dev
```

The `Pickle Balls` circle is created automatically on first owner sign-in.

## Dev vs prod databases

- **Local dev** uses Prisma Postgres instance `pickleballs`: database port
  `51218`, dedicated migration shadow port `51219`. `.env` points there.
- **Prod** is the hosted Prisma Postgres database. Its URL lives **only** in
  Vercel's environment variables and in `.env.production.local` (gitignored
  backup, never committed). Never put the prod URL in `.env`.
- **Migrations need the direct URL.** Vercel must also have
  `DIRECT_DATABASE_URL` set to the direct (non-pooled) Postgres URL. `prisma
  migrate deploy` takes a Postgres advisory lock that the pooled
  `DATABASE_URL` cannot grant, so the build fails with a P1002 timeout
  without it. Runtime traffic keeps using the pooled `DATABASE_URL`.
- **Browser tests** use a second Prisma Postgres instance on database port
  `51221` (shadow port `51222`). The test setup rejects the dev port before it
  can reset anything.

Prisma dev's TCP endpoint always routes to its one internal `template1`
database, regardless of the path in the URL. A different URL path is therefore
not isolation. Separate ports provide the isolation; `SHADOW_DATABASE_URL`
also prevents `migrate dev` from replaying migrations against the dev data.

Rule of thumb: if `.env` ever contains `pooled.db.prisma.io`, stop and fix
it before running any `prisma` or `db:` command.

## Database migrations

Schema changes go through Prisma Migrate, never `db push`:

```bash
bunx prisma migrate dev --name describe_the_change  # local, applies + creates SQL
bun run db:migrate                                   # local: applies committed pending SQL
```

`bun run vercel-build` runs Prisma's standard `migrate deploy` before building
the app. Vercel therefore stops a deployment if its database migration fails,
while the previous release remains live.

`bun run db:reset` destroys all current database data and re-applies
migrations. Run it only when a reset is intentional.

Treat committed migrations as immutable. If an applied migration is wrong,
add a corrective migration instead of editing the old SQL. Production changes
must also work with the release currently serving traffic:

1. **Expand:** add nullable columns, new tables, or new enum values without
   removing anything the old release uses.
2. **Backfill and switch:** migrate existing rows in bounded batches, then
   deploy code that reads the new shape. Dual-write during transitions when
   necessary.
3. **Contract:** in a later deploy, remove old columns, constraints, or enum
   values only after no live code uses them.

Never combine a destructive rename, drop, or required-column change with the
code switch in one deploy. Keep large data backfills out of the Vercel build.

One-time note: databases created with the old `db push` flow have no
migration history. Mark the baseline as applied once instead of replaying it:

```bash
bunx prisma migrate resolve --applied 20260903000000_baseline
```

If production reports P1002, do not blindly start several more deployments.
Prisma's advisory lock waits for only ten seconds, so overlapping builds can
make one fail safely. Let the active deployment finish, then retry once. If no
deployment is active, inspect lock `72707369` in `pg_locks` joined to
`pg_stat_activity`; an abandoned idle session may need to be terminated first.

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

The app uses AI SDK 7 `generateText` with a bounded `Output.object` schema for
advisory task-proof comparison.

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
TEST_DATABASE_URL="postgres://postgres:postgres@localhost:51221/pickle_balls_test?sslmode=disable" bun run test:browser
```

The browser-test setup force-resets only that guarded test database and seeds
four Discord-style sessions. It never uses `DATABASE_URL` as the reset target.
