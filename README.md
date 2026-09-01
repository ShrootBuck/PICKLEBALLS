# Pickle Balls

Pickle Balls is a small-group accountability app. You make up to three concrete promises, report blockers before the deadline, and post a daily Screen Time receipt. The goal is not to schedule pickleball. The goal is to stop losing the time to scrolling.

## Stack

- Next.js 16 and React 19
- Prisma ORM 7 with PostgreSQL
- AI SDK 7 with OpenRouter
- Biome and TypeScript

## Local setup

Install dependencies and create the local environment file:

```bash
bun install
cp .env.example .env
```

Add a PostgreSQL URL and an OpenRouter API key to `.env`, then prepare the database:

```bash
bun run db:generate
bun run db:migrate
bun run db:seed
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

The interface uses demo state until a database URL is configured. The Prisma schema already models users, circles, memberships, daily commitments, check-ins, and reviewed Screen Time receipts.

## Screen Time extraction

`POST /api/screen-time/analyze` accepts one PNG, JPEG, or WebP file up to 8 MB. AI SDK structured output extracts only the visible Screen Time values. The person who uploaded the image must review and confirm those values before the receipt appears in the app.

The image is sent to the OpenRouter model configured by `OPENROUTER_MODEL`. The route does not save the uploaded image or log the request body.

## Checks

```bash
bun run lint
bun run typecheck
bun run build
bun run db:validate
```
