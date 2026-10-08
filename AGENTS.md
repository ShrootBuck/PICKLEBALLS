<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Copy

Never use em dashes in copy. Use commas, colons, parentheses, or separate sentences instead.

# Changelog — noteworthy features only

Treat `lib/changelog.ts` as a curated list of product updates, not a development log. Add an entry only for a substantial new capability, removal, or workflow/rule change that ordinary users would care about. Being user-visible is not enough. Ask: would someone want to learn about this because it changes what they can do or how they use the app? If the benefit is just that the app looks nicer, runs more smoothly, or works as expected, skip it. When in doubt, leave it out.

- Include updates like weekly screen-time leaderboards, a substantially simpler screen-time submission workflow, owner member-management tools, saved AI reads in proof history, user-selectable theme colors, or requiring a comment to approve proof.
- Exclude bug fixes, reliability/performance improvements, refresh or caching behavior, cosmetic changes (fonts, colors, borders, spacing), copy or AI tone changes, validation details, refactors, dependency updates, and internal tooling or instructions. Examples to skip: “Fresh data without the reload,” “Browser refresh only,” crash fixes, and palette changes. Adding a color preference users can choose is a feature; changing the palette yourself is cosmetic.
- Write a short title and plain-language description focused on the capability and why it matters. Strip incidental polish, bug fixes, and implementation details even when they shipped alongside a noteworthy feature. Do not dress up maintenance as a feature.
- Keep entries newest first, preserve original timestamps when editing history, and combine related changes into one entry. Do not add an entry for editing the changelog itself.

`timestamp` is milliseconds since the Unix epoch, run `bun -e "console.log(Date.now())"` for "now".

# Dev vs prod databases

- Local dev uses the isolated `pickleballs` instance on database port 51218
  with shadow port 51219. Start it with `bun run db:dev`.
- `.env` must ALWAYS point at local. Production credentials live in Coolify;
  `.env.production.local` is a gitignored legacy cloud credential file.
- Production runs on the home server. Runtime and migrations use its private
  direct Postgres URL, configured as `DATABASE_URL` and `DIRECT_DATABASE_URL`.
- Schema changes: `bunx prisma migrate dev --name x` (local), commit SQL, then
  push main. Both independent Coolify web and worker containers run
  `migrate deploy --config prisma.deploy.config.ts` before startup. Never
  `db push` or `migrate dev` against production. See `docs/self-hosting.md`
  for deployment and rollback.
- Pushes to `main` run `.github/workflows/ci.yml`. CI checks code, builds both
  Docker targets, upgrades a populated disposable Postgres, and checks that SQL
  matches the Prisma schema. Include the migration SQL with every schema change;
  never edit an already-deployed migration. Add a new migration instead.
- CI alone advances `codex/production-web` and `codex/production-worker`.
  These are deployment pointers, not working branches. Do not push them manually.
  Web applies migrations and becomes ready before CI promotes the worker. A green
  deploy job means both services report the tested commit and old assets still
  load. A passing local check or push alone does not establish deployment success.
- Backward compatibility is not required. Rename, drop, or reshape schema in
  the same release as the code that needs it, and delete unused columns,
  tables, enum values, and compatibility shims instead of keeping them for
  older releases. A brief error in the old release during a deploy is fine.
- Never lose data that is still wanted. Before dropping or reshaping anything,
  move the data it holds (rename instead of drop and recreate, backfill, or
  convert into the new shape). Wrap destructive migrations in one
  transaction, check them against a populated database, and never let a
  change to one table delete unrelated rows. Only discard data for features
  that were deliberately removed.

<!-- TRIGGER.DEV SKILLS START -->
## Trigger.dev agent skills

This project has Trigger.dev agent skills installed in `.agents/skills/`. Before writing or changing Trigger.dev code (background tasks, scheduled tasks, realtime, or chat.agent AI agents), load the most relevant skill: `trigger-authoring-chat-agent`, `trigger-authoring-tasks`, `trigger-chat-agent-advanced`, `trigger-cost-savings`, `trigger-getting-started`, `trigger-realtime-and-frontend`.
<!-- TRIGGER.DEV SKILLS END -->
