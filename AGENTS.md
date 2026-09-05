<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Changelog — DOCUMENT EVERY CHANGE IN THE CHANGELOG!

Every user-facing change MUST add an entry to `lib/changelog.ts` (newest first).

`timestamp` is milliseconds since the Unix epoch, run `bun -e "console.log(Date.now())"` for "now".

# Dev vs prod databases

- Local dev uses two isolated `prisma dev` instances. `pickleballs` listens on
  database port 51218 with shadow port 51219; `pickleballs-test` listens on
  database port 51221 with shadow port 51222. Start both with `bun run db:dev`.
- `.env` must ALWAYS point at local. Prod URL lives only in Vercel env vars
  and `.env.production.local` (gitignored backup). If `.env` contains
  `pooled.db.prisma.io`, stop and fix it before running any prisma/db command.
- Vercel also needs `DIRECT_DATABASE_URL` = the direct (non-pooled) Postgres
  URL. `migrate deploy` takes a Postgres advisory lock the pooled
  `DATABASE_URL` cannot grant (P1002 timeout). Runtime keeps the pooled URL.
- Schema changes: `bunx prisma migrate dev --name x` (local) → commit SQL →
  push → Vercel `migrate deploy` applies it. Never `db push`. Never
  `migrate dev` against prod.
- Browser tests need `TEST_DATABASE_URL` pointing at a database with `test`
  in its name (guarded): disposable local URL is
  `postgres://postgres:postgres@localhost:51221/pickle_balls_test?sslmode=disable`.

<!-- TRIGGER.DEV SKILLS START -->
## Trigger.dev agent skills

This project has Trigger.dev agent skills installed in `.agents/skills/`. Before writing or changing Trigger.dev code (background tasks, scheduled tasks, realtime, or chat.agent AI agents), load the most relevant skill: `trigger-authoring-chat-agent`, `trigger-authoring-tasks`, `trigger-chat-agent-advanced`, `trigger-cost-savings`, `trigger-getting-started`, `trigger-realtime-and-frontend`.
<!-- TRIGGER.DEV SKILLS END -->
