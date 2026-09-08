# Stories and social interactions

Stories are a way to catch up on the last 24 hours of a circle's proof and
check-ins. They reuse the original posts, likes, and discussions. Story expiry
does not delete proof or remove posts from history.

## Experience

- Your story is always first, with a separate add button. People with unseen
  attachments come next, ordered by their latest update, followed by seen people.
  Members with no recent posts do not get empty story buttons.
- A viewer starts at the first unseen attachment and moves through a person's
  posts chronologically, then continues to the next person. The sequence stays
  stable while watching, even as the tray changes its unread ordering.
- Images fit without cropping. Video starts muted and advances when it ends.
  Arrows, tap targets, horizontal swipes, progress segments, pause, and close
  controls are available. Holding an image pauses it; opening comments or leaving
  the browser pauses playback. Reduced-motion preferences start stories paused.
- Viewing is saved per attachment, account, and circle after content loads and
  stays visible briefly. Failed media does not count as seen. Reloading resumes
  at the next unseen attachment.
- Story rings on feed avatars open stories. Names open profiles. Profiles have a
  post grid and a list toggle, with layout retained while moving between pages.
- Likes and comments work in the feed and viewer. Comments open in a dialog and
  share the original post's thread. Post menus expose full posts, profile links,
  and a copy-link action.
- Story composition offers proof and check-ins and returns to Home after posting.
  Home also has direct proof and check-in actions and a link to today's tasks.

## Data and release

`20260908232236_story_views` adds `StoryView`. It uses unique viewer, target,
attachment constraints and cascading foreign keys. SQL checks require exactly
one target and valid frame positions. The API validates membership, active
circle, target, expiry, and frame count. Replaced proof is omitted from stories.

Recent stories are read independently of feed pagination, so prolific posters
cannot hide another member's recent update beyond the first feed page. Read
receipts do not trigger a full application refresh after every attachment.

The migration has been applied to the isolated local development database and
validated against disposable Postgres. The production build applies committed
migrations through the existing Vercel build command. No production deployment
was performed.

## Validation

- 18 unit tests pass, including story ordering, partial viewing, frame identity,
  chronology, feed reconciliation, and existing notification behavior.
- 12 disposable database tests pass, including populated-database migration,
  per-attachment receipts, expiry boundaries, future dates, duplicate views,
  replacements, database constraints, and circle isolation.
- HTTP checks pass for authorization, CSRF, story isolation, malformed frame
  requests, persisted receipt reads, and existing post and discussion behavior.
- Browser checks cover mobile and desktop layouts, resume after reload,
  automatic video/photo progression, unseen-to-seen reordering, posting a
  check-in from the story composer, comments and likes, focus restoration,
  and profile grid/list navigation.
- Biome, TypeScript, the UI composition audit, schema validation, and a production
  build pass. Build output is kept separate from the running development fixture.

Browser viewport checks do not replace testing native iOS and Android media
pickers, safe-area behavior, and video playback on physical devices.
