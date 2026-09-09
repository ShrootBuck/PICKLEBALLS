# Trigger.dev

Project: `proj_xyssxtuhmwrlrkqotyxb`.

Run `bun run dev:trigger` alongside `bun run dev`. The development API key belongs in `.env`. Development tasks run on your machine and use the local database on port 51218. The CLI is already authenticated. `health-check` is safe to run from the dashboard without sending notifications or changing app data.

## Jobs

- `assess-proof`: proof photo AI reads, with retries and a final failure status.
- `read-screen-time`: screenshot extraction and saved readings. The API still waits for the reading so the existing confirmation UI works.
- `notify-proof-submitted`, `notify-proof-reviewed`, `notify-reply-received`: inbox fan-out with per-recipient database deduplication.
- `deliver-push`: push delivery with retries and stale subscription removal. Retries use the same notification tag, but delivery is at least once, so a device may receive another delivery attempt.
- `screen-time-reminders`: Sunday at 10 a.m. Phoenix time.
- `reconcile-missed-tasks` and `reconcile-circle`: daily at 12:05 a.m. Phoenix time, with independent circle retries.

Schedules are production-only. Video encoding is not implemented.

The web app uses Trigger.dev when `TRIGGER_SECRET_KEY` is present. Without it, existing local execution remains available. Proof completion is observed through the existing response stream; the task survives a disconnected client or an expired web request. Screen-time callers can retry after a lost response and recover the saved reading. Authorization remains in the API routes. Task payloads contain IDs, not image bytes or credentials.

## Vercel pipeline (recommended)

This repository deploys through Vercel and has no GitHub Actions workflow. In Trigger.dev project Settings, connect Vercel project `pickleballs` and GitHub repository `ShrootBuck/PICKLEBALLS`. The Trigger install command is `bunx bun@1.4.0 install --frozen-lockfile`, the pre-build command is `bun run db:generate`, and the config path is `trigger.config.ts`. The pinned installer is required because the build image includes an older Bun that cannot read lockfile version 2.

The native integration deploys tasks on Vercel deployments, matches app and worker commit versions, and syncs the appropriate `TRIGGER_SECRET_KEY` into Vercel. No `TRIGGER_ACCESS_TOKEN` is needed for this integration. Review environment sync to include only the worker dependencies listed below. Vercel variables marked Sensitive cannot be read by the integration. `scripts/sync-trigger-env.ts` runs during the production Vercel build and copies only the worker allowlist directly to Trigger.dev as secret variables. Values are never printed.

For custom GitHub Actions instead, the deploy step uses a Trigger personal access token stored as the GitHub Actions secret `TRIGGER_ACCESS_TOKEN`. That token is distinct from runtime API keys and does not belong in Vercel.

Reference: https://trigger.dev/docs/vercel-integration

## Production rollout

1. Configure the production Trigger.dev environment with its production database URL, `OPENROUTER_API_KEY`, R2 credentials (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`), VAPID keys and subject, and `NEXT_PUBLIC_APP_URL`. Keep production database credentials out of `.env`. Do not sync local environment files into production.
2. Run `bun run deploy:trigger`. Prisma Client is generated before bundling. The Trigger worker resolves `server-only` using the `react-server` condition and externalizes Sharp.
3. Set the production environment's `TRIGGER_SECRET_KEY` in Vercel. Never use the development key there.
4. After verifying the Trigger production schedules, set `TRIGGER_SCHEDULES_ENABLED=true` in Vercel. Legacy Vercel cron routes then acknowledge without executing. Their definitions remain as a rollout fallback. During the brief overlap, reminder database deduplication and conditional reconciliation updates prevent duplicate inbox rows and missed-task events.

GitHub repository and Vercel project are connected. Pushes to `main` deploy the app and worker through the native integration. The build sync step handles sensitive worker credentials. The development key remains local; Vercel receives its production key from the integration.
