import type { ActivityKind } from "@/generated/prisma/enums";

// Apply the same policy to creation, inbox queries, and unread counts. Legacy
// activity notices stay in storage but no longer appear in the inbox.
export const inboxKinds: ActivityKind[] = [
  "REPLY_POSTED",
  "PROOF_SUBMITTED",
  "PROOF_APPROVED",
  "PROOF_CHALLENGED",
  "SCREEN_TIME_REMINDER",
];

export const notificationPageSize = 30;

export type NotificationPrefs = {
  proofsSubmitted: boolean;
  screenTime: boolean;
};

export const defaultNotificationPrefs: NotificationPrefs = {
  proofsSubmitted: true,
  screenTime: true,
};

export function shouldCreateNotification(
  kind: ActivityKind,
  prefs: NotificationPrefs = defaultNotificationPrefs,
) {
  return (
    inboxKinds.includes(kind) &&
    (kind !== "SCREEN_TIME_REMINDER" || prefs.screenTime)
  );
}

export function shouldPushNotification(
  kind: ActivityKind,
  prefs: NotificationPrefs = defaultNotificationPrefs,
) {
  return (
    shouldCreateNotification(kind, prefs) &&
    (kind !== "PROOF_SUBMITTED" || prefs.proofsSubmitted)
  );
}
