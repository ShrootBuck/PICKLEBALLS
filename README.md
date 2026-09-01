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

The seed creates the `Pickle Balls` circle and the local invite code
`PICKLE-BALLS-04`. Change that code before a public deployment.

## Authentication

Better Auth owns users, password accounts, database sessions, and auth rate
limits. Sign-up goes through `/api/join`, which validates the circle invite
before it calls Better Auth. Calling Better Auth's public email sign-up route
directly is blocked.

The home page and Screen Time analysis route require a valid session. Passwords
must have at least 12 characters. Email verification and password reset are not
enabled yet because those flows need a real email provider.

## Screen Time extraction

`POST /api/screen-time/analyze` accepts one PNG, JPEG, or WebP file up to 8 MB.
AI SDK structured output extracts only the visible Screen Time values. The person
who uploaded the image must review and confirm those values before the receipt
appears in the app.

The image is sent to the OpenRouter model configured by `OPENROUTER_MODEL`. The
route does not save the uploaded image or log the request body.

## Checks

```bash
bun run lint
bun run typecheck
bun run build
bun run db:validate
```
