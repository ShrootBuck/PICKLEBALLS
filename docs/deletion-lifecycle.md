# Deletion and ownership

All content mutations check the active circle, current membership, and ownership on the server. Lifecycle changes use serializable transactions; an ownership transfer racing a removal or deletion must recheck permissions. No owner can leave or delete their account while still owning a circle. Transfer to another current member or explicitly delete that circle first.

## User-facing rules

- Accounts: Settings and the Circles page offer permanent deletion. The server requires `DELETE` and a live session created within the last 10 minutes. Discord sign-in can refresh this requirement. All sessions, provider credentials, profile data, personal posts, private chat, goals, streaks, and owned uploads are removed. Shared bucket-list plans survive with a null proposer. Reviews on other people's proof keep their decision and count, but lose reviewer attribution and personal note text. These render as `Deleted member`.
- Circles: members can leave; owners can transfer ownership to a current member or delete the circle by typing its name. Leaving preserves historical content and existing approval requirements. Circle deletion removes circle data, including other members' posts, but never deletes their accounts or data in another circle. Private chats are account-scoped and survive circle deletion.
- Replies: authors can delete at any age. The existing 10-minute editing limit still applies. Review decisions are distinct from ordinary replies.
- Goals: authors can permanently delete goals and milestones. Linked tasks survive with no goal link. Archive remains available.
- Commitments: cancellation keeps a `CANCELLED` history entry and removes proof and pending publication. It does not count as a completion. Already missed/verified results, including expired tasks not yet reconciled, cannot be cancelled. Cancelled tasks cannot be edited, submitted, or reviewed.
- Proof: owners can remove every proof version and its discussions for a task. An already verified task stays verified. Unreviewed proof cannot receive more approvals after removal; the task reopens and retains its original deadline and timely-submission eligibility. Removing proof does not reopen task-title editing.
- Check-ins: authors can delete individual updates. The daily aggregate falls back to the latest surviving update, or disappears if no updates remain.
- Screen Time: deletion removes the week's submission and all of that user's earlier reads/screenshots for the same circle and week. A new submission still follows the ordinary reporting window.
- Bucket-list plans: proposer or circle owner can permanently delete the plan, votes, and discussion. Withdrawal remains the reversible-history alternative.
- Streaks: existing author-only deletion also queues cleanup of discussion attachments.

## Files and workers

`ObjectDeletion` is a durable outbox committed with deletion. API access disappears with the source rows. Storage removal starts after the response and resumes from the existing media-recovery/pruning jobs (or the fallback cron route). Deletion is idempotent. Failed jobs never expire and retry with bounded backoff. Multipart uploads are aborted, staging objects are deleted, and media prefixes include late encoder outputs. Successful jobs repeat for three days to cover already-issued upload URLs and running encoders. This is eventual physical deletion, not a promise that every storage byte disappears before the HTTP response.

Check cleanup backlog using counts of `ObjectDeletion` rows and overdue `nextAttemptAt` values. Investigate repeated `attempts` if storage permissions or connectivity fail. Do not manually drop outbox rows to silence failures. Existing external backups and files already downloaded by users are outside this live-data deletion path.

Cookie session caching is disabled so deleted accounts and revoked sessions stop authorizing requests immediately. Bootstrap membership is only created on initial account creation, not silently restored when a user leaves their last circle.

## Verification

- `bun test` includes a populated migration test for anonymous shared attribution.
- `bun run test:social` includes deletion permission, cascade, session, ownership, and storage-retry integration tests in disposable Postgres.
- Start `bun run test:social --serve`, then run `bun scripts/test-deletions-browser.ts` for mobile UI and HTTP checks against disposable accounts. The script checks origin rejection, stale circle rejection, ownership transfer, leave/delete circle, account deletion, and invalidation of a second session.
