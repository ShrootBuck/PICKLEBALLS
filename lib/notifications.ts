import "server-only";

import { idempotencyKeys, tasks } from "@trigger.dev/sdk";
import type { ActivityKind, Prisma } from "@/generated/prisma/client";
import { postHref, safeAppPath, squadHref } from "@/lib/navigation";
import {
  defaultNotificationPrefs,
  type NotificationPrefs,
  shouldCreateNotification,
  shouldPushNotification,
} from "@/lib/notification-policy";
import { getPrisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import { serializable } from "@/lib/transaction";
import type { notification as notificationTask } from "@/src/trigger/notification";

type NotificationContext = {
  prisma: Prisma.TransactionClient;
  pushes: Array<() => Promise<unknown>>;
};

// Inbox rows commit with the post/review/reply. Network calls run only after
// commit, and a retried transaction discards its previous delivery callbacks.
export async function withNotifications<T>(
  work: (
    tx: Prisma.TransactionClient,
    context: NotificationContext,
  ) => Promise<T>,
): Promise<T> {
  const { result, pushes } = await serializable(async (tx) => {
    const context: NotificationContext = { prisma: tx, pushes: [] };
    const result = await work(tx, context);
    return { result, pushes: context.pushes };
  });
  const deliveries = await Promise.allSettled(pushes.map((send) => send()));
  for (const delivery of deliveries) {
    if (delivery.status === "rejected")
      console.warn("Push dispatch failed; inbox notification is saved");
  }
  return result;
}

export async function getNotificationPrefs(
  userId: string,
  prisma: Prisma.TransactionClient = getPrisma(),
): Promise<NotificationPrefs> {
  const row = await prisma.notificationPreference.findUnique({
    where: { userId },
    select: { proofsSubmitted: true },
  });
  if (!row) return { ...defaultNotificationPrefs };
  return {
    proofsSubmitted: row.proofsSubmitted,
  };
}

async function getNotificationPrefsByUser(
  userIds: string[],
  prisma: Prisma.TransactionClient,
) {
  const rows = userIds.length
    ? await prisma.notificationPreference.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, proofsSubmitted: true },
      })
    : [];
  const byUser = new Map(
    rows.map((row) => [row.userId, { proofsSubmitted: row.proofsSubmitted }]),
  );
  return (userId: string): NotificationPrefs =>
    byUser.get(userId) ?? { ...defaultNotificationPrefs };
}

function snippet(text: string | null | undefined, max = 140) {
  const clean = (text ?? "").trim().replaceAll(/\s+/g, " ");
  if (!clean) return "";
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export async function createNotificationAndPush(
  input: {
    recipientId: string;
    actorId: string;
    circleId: string;
    kind: ActivityKind;
    entityId?: string | null;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    allowSelf?: boolean;
    dedupeKey?: string;
    // Preloaded by fan-out callers to avoid one lookup per recipient.
    prefs?: NotificationPrefs;
  },
  context?: NotificationContext,
) {
  if (input.recipientId === input.actorId && !input.allowSelf) return null;
  if (!shouldCreateNotification(input.kind)) return null;
  const prisma = context?.prisma ?? getPrisma();
  const prefs =
    input.prefs ?? (await getNotificationPrefs(input.recipientId, prisma));
  const fallbackUrl = squadHref(input.circleId, input.entityId);
  const path = safeAppPath(input.data?.url, fallbackUrl);
  const destination = new URL(path, "https://app.invalid");
  destination.searchParams.set("circle", input.circleId);
  const url = `${destination.pathname}${destination.search}${destination.hash}`;

  const data = {
    recipientId: input.recipientId,
    actorId: input.actorId,
    circleId: input.circleId,
    kind: input.kind,
    entityId: input.entityId ?? null,
    title: input.title.slice(0, 120),
    body: input.body.slice(0, 500),
    data: { ...input.data, url },
    dedupeKey: input.dedupeKey,
  };
  // Upsert avoids leaving a transaction aborted after a duplicate-key error.
  const notification = input.dedupeKey
    ? await prisma.notification.upsert({
        where: { dedupeKey: input.dedupeKey },
        create: data,
        update: {},
        select: { id: true },
      })
    : await prisma.notification.create({ data, select: { id: true } });
  if (!notification) return null;
  if (!shouldPushNotification(input.kind, prefs)) return notification;

  const send = async () => {
    if (process.env.TRIGGER_SECRET_KEY) {
      await tasks.trigger<typeof notificationTask>(
        "notification",
        { kind: "push", notificationId: notification.id },
        {
          idempotencyKey: await idempotencyKeys.create(
            `push:${notification.id}`,
            { scope: "global" },
          ),
        },
      );
      return;
    }

    try {
      await sendPushToUser(input.recipientId, {
        title: input.title,
        body: input.body,
        url,
        tag: notification.id,
        notificationId: notification.id,
      });
    } catch (error) {
      // Inbox row is the source of truth; a push failure must never
      // roll back the notification itself.
      console.warn("Push fan-out failed", {
        recipientId: input.recipientId,
        kind: input.kind,
        error,
      });
    }
  };
  if (context) context.pushes.push(send);
  else await send();
  return notification;
}

export async function notifyReplyReceived(
  input: {
    replyId: string;
    authorId: string;
    circleId: string;
  },
  context?: NotificationContext,
) {
  const prisma = context?.prisma ?? getPrisma();
  const reply = await prisma.socialReply.findFirst({
    where: { id: input.replyId, circleId: input.circleId },
    select: {
      id: true,
      body: true,
      createdAt: true,
      authorId: true,
      author: { select: { name: true } },
      commitment: { select: { id: true, userId: true, title: true } },
      checkIn: { select: { id: true, userId: true } },
      checkInUpdate: { select: { id: true, userId: true } },
      proof: {
        select: {
          id: true,
          ownerId: true,
          commitment: { select: { title: true } },
        },
      },
      review: {
        select: {
          id: true,
          reviewerId: true,
          proof: {
            select: {
              id: true,
              ownerId: true,
              commitment: { select: { title: true } },
            },
          },
        },
      },
    },
  });
  if (!reply || reply.authorId !== input.authorId) return [];

  const authorName = reply.author.name;
  const preview = snippet(reply.body || "Sent an attachment");
  const jobs: Array<{
    recipientId: string;
    context: string;
    entityId: string;
    url?: string;
  }> = [];

  if (reply.commitment) {
    jobs.push({
      recipientId: reply.commitment.userId,
      context: `your task “${reply.commitment.title}”`,
      entityId: reply.commitment.id,
    });
  } else if (reply.checkInUpdate) {
    jobs.push({
      recipientId: reply.checkInUpdate.userId,
      context: "your check-in",
      entityId: reply.checkInUpdate.id,
      url: `${postHref(input.circleId, "check-in", reply.checkInUpdate.id)}#comments`,
    });
  } else if (reply.checkIn) {
    jobs.push({
      recipientId: reply.checkIn.userId,
      context: "your check-in",
      entityId: reply.checkIn.id,
    });
  } else if (reply.proof) {
    jobs.push({
      recipientId: reply.proof.ownerId,
      context: `your proof for “${reply.proof.commitment.title}”`,
      entityId: reply.proof.id,
      url: `${postHref(input.circleId, "proof", reply.proof.id)}#comments`,
    });
  } else if (reply.review) {
    jobs.push({
      recipientId: reply.review.reviewerId,
      context: "your review",
      entityId: reply.review.proof.id,
      url: `${postHref(input.circleId, "proof", reply.review.proof.id)}&focus=${encodeURIComponent(reply.review.id)}#comments`,
    });
    // A reply to a review is also aimed at the proof owner.
    if (reply.review.proof.ownerId !== reply.review.reviewerId) {
      jobs.push({
        recipientId: reply.review.proof.ownerId,
        context: `a review on your proof for “${reply.review.proof.commitment.title}”`,
        entityId: reply.review.proof.id,
        url: `${postHref(input.circleId, "proof", reply.review.proof.id)}&focus=${encodeURIComponent(reply.review.id)}#comments`,
      });
    }
  }

  // Proof comments and verdict replies now share one discussion.
  const discussionProofId = reply.proof?.id ?? reply.review?.proof.id;
  const target = reply.commitment
    ? { commitmentId: reply.commitment.id }
    : reply.checkInUpdate
      ? { checkInUpdateId: reply.checkInUpdate.id }
      : reply.checkIn
        ? { checkInId: reply.checkIn.id }
        : reply.proof
          ? { proofId: reply.proof.id }
          : reply.review
            ? { reviewId: reply.review.id }
            : null;
  const destination = jobs[0];
  if (!target || !destination) return [];

  const participants = await prisma.socialReply.findMany({
    where: {
      circleId: input.circleId,
      ...(discussionProofId
        ? {
            OR: [
              { proofId: discussionProofId },
              { review: { proofId: discussionProofId } },
            ],
          }
        : target),
      // Delayed jobs must not notify people about replies from before they joined.
      createdAt: { lte: reply.createdAt },
      authorId: { not: input.authorId },
    },
    distinct: ["authorId"],
    select: { authorId: true },
  });
  if (discussionProofId) {
    const reviewers = await prisma.taskProofReview.findMany({
      where: {
        circleId: input.circleId,
        proofId: discussionProofId,
        note: { not: null },
        createdAt: { lte: reply.createdAt },
      },
      select: { reviewerId: true },
    });
    for (const reviewer of reviewers)
      participants.push({ authorId: reviewer.reviewerId });
  }
  for (const participant of participants) {
    jobs.push({
      ...destination,
      recipientId: participant.authorId,
      context: "a thread you’re participating in",
    });
  }
  const members = await prisma.membership.findMany({
    where: {
      circleId: input.circleId,
      userId: { in: [...new Set(jobs.map((job) => job.recipientId))] },
    },
    select: { userId: true },
  });
  const memberIds = new Set(members.map((member) => member.userId));
  const seen = new Set<string>();
  const recipients = jobs.filter((job) => {
    if (
      job.recipientId === input.authorId ||
      seen.has(job.recipientId) ||
      !memberIds.has(job.recipientId)
    ) {
      return false;
    }
    seen.add(job.recipientId);
    return true;
  });
  const prefsFor = await getNotificationPrefsByUser([...seen], prisma);
  const results = await Promise.all(
    recipients.map((job) =>
      createNotificationAndPush(
        {
          recipientId: job.recipientId,
          actorId: input.authorId,
          circleId: input.circleId,
          dedupeKey: `reply:${reply.id}:${job.recipientId}`,
          kind: "REPLY_POSTED",
          entityId: job.entityId,
          title: `${authorName} replied to ${job.context}`,
          body: preview || "New reply.",
          data: {
            url: job.url ?? squadHref(input.circleId, job.entityId),
            replyId: reply.id,
          },
          prefs: prefsFor(job.recipientId),
        },
        context,
      ),
    ),
  );
  return results.filter(Boolean);
}

export async function notifyProofSubmitted(
  input: {
    proofId: string;
    actorId: string;
    circleId: string;
  },
  context?: NotificationContext,
) {
  const prisma = context?.prisma ?? getPrisma();
  const proof = await prisma.taskProof.findFirst({
    where: { id: input.proofId, circleId: input.circleId },
    select: {
      id: true,
      ownerId: true,
      ownerNote: true,
      owner: { select: { name: true } },
      commitment: {
        select: { id: true, title: true, dueAt: true, status: true },
      },
    },
  });
  if (
    !proof ||
    proof.ownerId !== input.actorId ||
    proof.commitment.status === "MISSED" ||
    proof.commitment.dueAt <= new Date()
  )
    return [];
  const members = await prisma.membership.findMany({
    where: { circleId: input.circleId, userId: { not: input.actorId } },
    select: { userId: true },
  });
  const note = snippet(proof.ownerNote);
  const prefsFor = await getNotificationPrefsByUser(
    members.map((member) => member.userId),
    prisma,
  );
  return Promise.all(
    members.map((member) =>
      createNotificationAndPush(
        {
          recipientId: member.userId,
          actorId: input.actorId,
          circleId: input.circleId,
          dedupeKey: `proof:${proof.id}:${member.userId}`,
          kind: "PROOF_SUBMITTED",
          entityId: proof.id,
          title: `${proof.owner.name} submitted proof for “${proof.commitment.title}”`,
          body: note || "Needs your review.",
          data: {
            url: postHref(input.circleId, "proof", proof.id),
            proofId: proof.id,
          },
          prefs: prefsFor(member.userId),
        },
        context,
      ),
    ),
  );
}

export async function notifyProofReviewed(
  input: {
    reviewId: string;
    reviewerId: string;
    circleId: string;
  },
  context?: NotificationContext,
) {
  const prisma = context?.prisma ?? getPrisma();
  const review = await prisma.taskProofReview.findFirst({
    where: { id: input.reviewId, circleId: input.circleId },
    select: {
      id: true,
      decision: true,
      note: true,
      reviewerId: true,
      reviewer: { select: { name: true } },
      proof: {
        select: {
          id: true,
          ownerId: true,
          commitment: { select: { title: true } },
        },
      },
    },
  });
  if (!review || review.reviewerId !== input.reviewerId) return null;
  const approved = review.decision === "APPROVED";
  const note = snippet(review.note);
  return createNotificationAndPush(
    {
      recipientId: review.proof.ownerId,
      actorId: input.reviewerId,
      circleId: input.circleId,
      dedupeKey: `review:${review.id}:${review.proof.ownerId}`,
      kind: approved ? "PROOF_APPROVED" : "PROOF_CHALLENGED",
      entityId: review.proof.id,
      title: approved
        ? `${review.reviewer.name} approved your proof for “${review.proof.commitment.title}”`
        : `${review.reviewer.name} challenged your proof for “${review.proof.commitment.title}”`,
      body: note || (approved ? "Verified. Nice." : "Needs a better receipt."),
      data: {
        url: `${postHref(input.circleId, "proof", review.proof.id)}&focus=${encodeURIComponent(review.id)}#comments`,
        reviewId: review.id,
        decision: review.decision,
      },
    },
    context,
  );
}
