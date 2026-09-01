# Pickle Balls

Pickle Balls is a small-group accountability app. You make up to three concrete promises, report blockers before the deadline, and post a daily Screen Time receipt. The goal is not to schedule pickleball. The goal is to stop losing the time to scrolling.

## Stack

- Next.js 16 and React 19
- Prisma ORM 7 with PostgreSQL
- Better Auth with invite-gated email/password accounts
- AI SDK 7 with OpenRouter
- shadcn/ui with Base UI primitives
- Biome and TypeScript

## Local setup

Install dependencies and create the local environment file:

```bash
bun install
cp .env.example .env
```

Add a PostgreSQL URL, a generated Better Auth secret, and an OpenRouter API key
to `.env`, then prepare the database:

```bash
bun run db:generate
bun run db:deploy
bun run db:seed
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

The seed creates the `Pickle Balls` circle and placeholder member profiles. It
does not create password accounts.

## Authentication

Better Auth owns users, password accounts, database sessions, and auth rate
limits. Calling Better Auth's public email sign-up route directly is blocked.
Registration only works at a one-time `/join/[token]` URL.

Bootstrap `zayd@zaydkrunz.com` once from the terminal:

```bash
bun run auth:bootstrap-admin
```

Open the printed link and create the admin password. After that, use `/admin`
to make seven-day, single-use links for the other members. Only a SHA-256 hash
of each token is stored, so copy a new link when the panel shows it.

The home page and Screen Time analysis route require a valid session. Passwords
must have at least 12 characters. There is deliberately no email delivery,
verification, or automated password reset in this four-person version.

## Screen Time extraction

`POST /api/screen-time/analyze` accepts one PNG, JPEG, or WebP file up to 8 MB.
AI SDK structured output extracts only the visible Screen Time values. The person
who uploaded the image must review and confirm those values before the receipt
appears in the app.

The image is sent to `openai/gpt-5.6-sol` by default through OpenRouter. The
request pins OpenAI's Flex tier, disables provider fallbacks, requires structured
output support, and requests high reasoning. The route does not save the
uploaded image or log the request body.

## Checks

```bash
bun run lint
bun run typecheck
bun run build
bun run db:validate
```
