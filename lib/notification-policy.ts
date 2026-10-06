import type { ActivityKind } from "@/generated/prisma/enums";

// Apply the same policy to creation, inbox queries, and unread counts. Legacy
// activity notices stay in storage but no longer appear in the inbox.
export const inboxKinds: ActivityKind[] = [
  "REPLY_POSTED",
  "PROOF_SUBMITTED",
  "PROOF_CHALLENGED",
  "BUCKET_ITEM_PROPOSED",
  "BUCKET_ITEM_APPROVED",
  "BUCKET_ITEM_COMPLETION_REQUESTED",
  "BUCKET_ITEM_COMPLETED",
  "STREAK_NUDGE",
  "STREAK_REMINDER",
];

// The bell inbox only shows the last 24 hours; nothing older is offered.
export const notificationInboxWindowMs = 24 * 60 * 60 * 1000;

export function notificationInboxSince(now = Date.now()) {
  return new Date(now - notificationInboxWindowMs);
}

export type NotificationPrefs = {
  proofsSubmitted: boolean;
  streakReminders: boolean;
  streakWarnings: boolean;
  // Phoenix hours, 0 to 23.
  streakMorningHour: number;
  streakEveningHour: number;
};

export const defaultNotificationPrefs: NotificationPrefs = {
  proofsSubmitted: true,
  streakReminders: true,
  streakWarnings: true,
  streakMorningHour: 9,
  streakEveningHour: 23,
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
    (kind !== "PROOF_SUBMITTED" || prefs.proofsSubmitted) &&
    (kind !== "STREAK_REMINDER" ||
      prefs.streakReminders ||
      prefs.streakWarnings)
  );
}
