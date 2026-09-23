import type { ActivityKind } from "@/generated/prisma/enums";

// Apply the same policy to creation, inbox queries, and unread counts. Legacy
// activity notices stay in storage but no longer appear in the inbox.
export const inboxKinds: ActivityKind[] = [
  "REPLY_POSTED",
  "PROOF_SUBMITTED",
  "PROOF_APPROVED",
  "PROOF_CHALLENGED",
];

// The bell inbox only shows the last 24 hours; nothing older is offered.
export const notificationInboxWindowMs = 24 * 60 * 60 * 1000;

export function notificationInboxSince(now = Date.now()) {
  return new Date(now - notificationInboxWindowMs);
}

export type NotificationPrefs = {
  proofsSubmitted: boolean;
};

export const defaultNotificationPrefs: NotificationPrefs = {
  proofsSubmitted: true,
};

export function shouldCreateNotification(kind: ActivityKind) {
  return inboxKinds.includes(kind);
}

export function shouldPushNotification(
  kind: ActivityKind,
  prefs: NotificationPrefs = defaultNotificationPrefs,
) {
  return (
    shouldCreateNotification(kind) &&
    (kind !== "PROOF_SUBMITTED" || prefs.proofsSubmitted)
  );
}
