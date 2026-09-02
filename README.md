# Pickle Balls

Pickle Balls is a private schoolwork accountability app for four friends. It is
not a pickleball tracker. Each person can set up to three tasks per Phoenix day,
post photo proof, and get one peer approval or challenge. Daily and weekly
Screen Time receipts are a separate flow.

## Stack

- Next.js 16 and React 19
- Prisma ORM 7 with PostgreSQL
- Better Auth 1.7.2 with invite-gated Discord OAuth
- AI SDK 7 with `openai/gpt-5.6-sol` through OpenRouter OpenAI Flex
- shadcn/ui Base Nova with Base UI primitives
- Biome, TypeScript, Bun tests, Sharp image sanitization

## Local setup

```bash
bun install
cp .env.example .env
bun run db:generate
bun run db:push
bun run db:seed
bun run dev
```

The seed creates only the private `Pickle Balls` circle. It does not create fake
people. `bun run db:reset` destroys all current database data, pushes the schema,
regenerates Prisma, and seeds the circle. Run it only when a reset is intentional.

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

- Screen Time screenshot extraction with manual correction
- advisory task-proof comparison
- task wording refinement
- one cached squad brief per Phoenix day

Every request pins `openai/flex`, disables fallbacks, requires supported
parameters, sets `service_tier: flex`, times out after 60 seconds, and retries
once. AI never resolves proof. A friend does. Metadata-only run logs have a
30-day lifetime; prompts and images are not logged.

## Storage and retention

Proof and Screen Time images are decoded, auto-rotated, stripped of metadata,
bounded to 2048 pixels, and re-encoded as WebP before Postgres storage. Image
routes require circle membership and send private caching plus `nosniff`.

Operational data is pruned after 30 Phoenix calendar days on protected app
access and by `/api/cron/cleanup`. Vercel calls that route daily with
`Authorization: Bearer $CRON_SECRET`. Users, the circle, memberships, and active
Better Auth identity remain.

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
