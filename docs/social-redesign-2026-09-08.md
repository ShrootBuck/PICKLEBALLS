# Social redesign validation

Implemented the private social feed, progress bubbles, post likes, individual
check-in discussions, member profiles, posting and review overlays, and the
shared mobile and desktop shell. Screen time, timeblocks, history, settings,
sign-in, invitations, and circle management use the same dark visual system.

## Automated checks

- Bun tests cover feed cursor scope, timestamp ties, page reconciliation,
  refreshing older loaded posts, Phoenix dates, screen-time ranks, PDF generation,
  and the existing notification policy.
- The disposable Postgres suite applies older migrations, populates historical
  records, and then deploys the social migration. It verifies backfill timestamps,
  legacy discussions, independent update discussions, database constraints,
  duplicate likes, circle isolation, proof replacement, solo verification,
  midnight closure, failed media retry, advisory AI, and screen-time confirmation.
- HTTP checks exercise real signed sessions, unauthorized profiles, posts and
  media, cross-circle feed cursors, old URLs, comment pagination, likes, and CSRF.
- UI audit, Biome, TypeScript, Prisma schema validation, and the production build
  pass. No application-wide caching setting was changed.

## Browser checks

Checked the isolated fixture in Chromium at 390 × 844, 820 × 1180, and
1440 × 1000. The fixture uses a disposable database and local media; no external
AI or push delivery is enabled.

- Home opens personal tasks in one tap; a task opens proof composition in one
  additional tap.
- Task drafts survive closing and reopening the composer. A photo uploads and
  posts successfully with an empty caption. AI failure leaves proof reviewable.
- Approving requires a comment. Challenging requires a comment and a separate
  confirmation. The owner can submit a replacement and revisit the old attempt.
- Separate check-ins post with their own likes and discussions.
- Loaded feed pages survive opening and returning from a post. The measured
  scroll position was 6593 before navigation and 6593 after returning.
- Circle and account switches replace personal and circle state. Older screen-
  time weeks remain available. A manual timeblock entry survives reload and
  exports in the two-page PDF.
- Full evidence fits without cropping. Closing the viewer restores focus to
  its trigger. Mobile, tablet, and desktop layouts have no horizontal overflow.

## Release notes

The migration is additive and must run before serving the new application.
The existing `vercel-build` command performs that order. Leave the additive
schema installed if rolling the application back. Production has not been
deployed as part of these local checks.

Real iOS Safari, installed PWA, and Android Chrome device checks remain. Desktop
Chromium resizing does not verify their camera pickers, virtual keyboards,
safe-area behavior, or native pull gestures. The implementation includes native
file/camera inputs, safe-area spacing, reduced-motion handling, 44px mobile
controls, and an accessible refresh button.
