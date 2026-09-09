import "server-only";

import { idempotencyKeys, tasks } from "@trigger.dev/sdk";
import { type ActivityKind, Prisma } from "@/generated/prisma/client";
import { postHref, safeAppPath, squadHref } from "@/lib/navigation";
import {
  defaultNotificationPrefs,
  type NotificationPrefs,
  shouldCreateNotification,
  shouldPushNotification,
} from "@/lib/notification-policy";
import { getPrisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import type { deliverPush } from "@/src/trigger/push";

export async function getNotificationPrefs(
  userId: string,
): Promise<NotificationPrefs> {
  const row = await getPrisma().notificationPreference.findUnique({
    where: { userId },
    select: { proofsSubmitted: true, screenTime: true },
  });
  if (!row) return { ...defaultNotificationPrefs };
  return {
    proofsSubmitted: row.proofsSubmitted,
    screenTime: row.screenTime,
  };
}

function snippet(text: string | null | undefined, max = 140) {
  const clean = (text ?? "").trim().replaceAll(/\s+/g, " ");
  if (!clean) return "";
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export async function createNotificationAndPush(input: {
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
}) {
  if (input.recipientId === input.actorId && !input.allowSelf) return null;
  if (!shouldCreateNotification(input.kind)) return null;
  const prefs = await getNotificationPrefs(input.recipientId);
  if (!shouldCreateNotification(input.kind, prefs)) return null;

  const prisma = getPrisma();
  const fallbackUrl = squadHref(input.circleId, input.entityId);
  const path = safeAppPath(input.data?.url, fallbackUrl);
  const destination = new URL(path, "https://app.invalid");
  destination.searchParams.set("circle", input.circleId);
  const url = `${destination.pathname}${destination.search}${destination.hash}`;

  const notification = await prisma.notification
    .create({
      data: {
        recipientId: input.recipientId,
        actorId: input.actorId,
        circleId: input.circleId,
        kind: input.kind,
        entityId: input.entityId ?? null,
        title: input.title.slice(0, 120),
        body: input.body.slice(0, 500),
        data: { ...input.data, url },
        dedupeKey: input.dedupeKey,
      },
      select: { id: true },
    })
    .catch((error: unknown) => {
      if (
        input.dedupeKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        return prisma.notification.findUnique({
          where: { dedupeKey: input.dedupeKey },
          select: { id: true },
        });
      throw error;
    });
  if (!notification) return null;
  if (!shouldPushNotification(input.kind, prefs)) return notification;

  if (process.env.TRIGGER_SECRET_KEY) {
    await tasks.trigger<typeof deliverPush>(
      "deliver-push",
      { notificationId: notification.id },
      {
        idempotencyKey: await idempotencyKeys.create(
          `push:${notification.id}`,
          { scope: "global" },
        ),
      },
    );
    return notification;
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
  return notification;
}

export async function notifyReplyReceived(input: {
  replyId: string;
  authorId: string;
  circleId: string;
}) {
  const prisma = getPrisma();
  const reply = await prisma.socialReply.findFirst({
    where: { id: input.replyId, circleId: input.circleId },
    select: {
      id: true,
      body: true,
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
      url: postHref(input.circleId, "check-in", reply.checkInUpdate.id),
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
      url: postHref(input.circleId, "proof", reply.proof.id),
    });
  } else if (reply.review) {
    jobs.push({
      recipientId: reply.review.reviewerId,
      context: "your review",
      entityId: reply.review.proof.id,
      url: postHref(input.circleId, "proof", reply.review.proof.id),
    });
    // A reply to a review is also aimed at the proof owner.
    if (reply.review.proof.ownerId !== reply.review.reviewerId) {
      jobs.push({
        recipientId: reply.review.proof.ownerId,
        context: `a review on your proof for “${reply.review.proof.commitment.title}”`,
        entityId: reply.review.proof.id,
        url: postHref(input.circleId, "proof", reply.review.proof.id),
      });
    }
  }

  const seen = new Set<string>();
  const results = [];
  for (const job of jobs) {
    if (job.recipientId === input.authorId || seen.has(job.recipientId)) {
      continue;
    }
    seen.add(job.recipientId);
    results.push(
      await createNotificationAndPush({
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
      }),
    );
  }
  return results.filter(Boolean);
}

export async function notifyProofSubmitted(input: {
  proofId: string;
  actorId: string;
  circleId: string;
}) {
  const prisma = getPrisma();
  const proof = await prisma.taskProof.findFirst({
    where: { id: input.proofId, circleId: input.circleId },
    select: {
      id: true,
      ownerId: true,
      ownerNote: true,
      owner: { select: { name: true } },
      commitment: { select: { id: true, title: true } },
    },
  });
  if (!proof || proof.ownerId !== input.actorId) return [];
  const members = await prisma.membership.findMany({
    where: { circleId: input.circleId, userId: { not: input.actorId } },
    select: { userId: true },
  });
  const note = snippet(proof.ownerNote);
  return Promise.all(
    members.map((member) =>
      createNotificationAndPush({
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
      }),
    ),
  );
}

export async function notifyProofReviewed(input: {
  reviewId: string;
  reviewerId: string;
  circleId: string;
}) {
  const prisma = getPrisma();
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
  return createNotificationAndPush({
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
      url: postHref(input.circleId, "proof", review.proof.id),
      reviewId: review.id,
      decision: review.decision,
    },
  });
}
