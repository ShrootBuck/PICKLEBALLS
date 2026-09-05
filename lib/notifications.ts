import "server-only";

import type { ActivityKind } from "@/generated/prisma/client";
import { safeAppPath, squadHref } from "@/lib/navigation";
import { getPrisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";

export type NotificationPrefs = {
  replies: boolean;
  proofsSubmitted: boolean;
  proofReviews: boolean;
  taskMissed: boolean;
  taskCreated: boolean;
  checkIns: boolean;
};

export const defaultNotificationPrefs: NotificationPrefs = {
  replies: true,
  proofsSubmitted: true,
  proofReviews: true,
  taskMissed: true,
  taskCreated: false,
  checkIns: false,
};

function prefFieldForKind(kind: ActivityKind): keyof NotificationPrefs | null {
  switch (kind) {
    case "REPLY_POSTED":
      return "replies";
    case "PROOF_SUBMITTED":
      return "proofsSubmitted";
    case "PROOF_APPROVED":
    case "PROOF_CHALLENGED":
      return "proofReviews";
    case "TASK_MISSED":
      return "taskMissed";
    case "TASK_CREATED":
    case "TASK_RENEGOTIATED":
      return "taskCreated";
    case "CHECK_IN_SET":
      return "checkIns";
    default:
      return null;
  }
}

export async function getNotificationPrefs(
  userId: string,
): Promise<NotificationPrefs> {
  const row = await getPrisma().notificationPreference.findUnique({
    where: { userId },
  });
  if (!row) return { ...defaultNotificationPrefs };
  return {
    replies: row.replies,
    proofsSubmitted: row.proofsSubmitted,
    proofReviews: row.proofReviews,
    taskMissed: row.taskMissed,
    taskCreated: row.taskCreated,
    checkIns: row.checkIns,
  };
}

export function isKindEnabled(
  prefs: NotificationPrefs | null,
  kind: ActivityKind,
): boolean {
  const field = prefFieldForKind(kind);
  if (!field) return false;
  return (prefs ?? defaultNotificationPrefs)[field];
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
}) {
  if (input.recipientId === input.actorId && !input.allowSelf) return null;
  const prefs = await getNotificationPrefs(input.recipientId);
  if (!isKindEnabled(prefs, input.kind)) return null;

  const prisma = getPrisma();
  const fallbackUrl = squadHref(input.circleId, input.entityId);
  const path = safeAppPath(input.data?.url, fallbackUrl);
  const destination = new URL(path, "https://app.invalid");
  destination.searchParams.set("circle", input.circleId);
  const url = `${destination.pathname}${destination.search}${destination.hash}`;

  const notification = await prisma.notification.create({
    data: {
      recipientId: input.recipientId,
      actorId: input.actorId,
      circleId: input.circleId,
      kind: input.kind,
      entityId: input.entityId ?? null,
      title: input.title.slice(0, 120),
      body: input.body.slice(0, 500),
      data: { ...input.data, url },
    },
    select: { id: true },
  });

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
  const preview = snippet(reply.body);
  const jobs: Array<{
    recipientId: string;
    context: string;
    entityId: string;
  }> = [];

  if (reply.commitment) {
    jobs.push({
      recipientId: reply.commitment.userId,
      context: `your task “${reply.commitment.title}”`,
      entityId: reply.commitment.id,
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
    });
  } else if (reply.review) {
    jobs.push({
      recipientId: reply.review.reviewerId,
      context: "your review",
      entityId: reply.review.proof.id,
    });
    // A reply to a review is also aimed at the proof owner.
    if (reply.review.proof.ownerId !== reply.review.reviewerId) {
      jobs.push({
        recipientId: reply.review.proof.ownerId,
        context: `a review on your proof for “${reply.review.proof.commitment.title}”`,
        entityId: reply.review.proof.id,
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
        kind: "REPLY_POSTED",
        entityId: job.entityId,
        title: `${authorName} replied to ${job.context}`,
        body: preview || "New reply.",
        data: {
          url: `/squad?focus=${job.entityId}`,
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
        kind: "PROOF_SUBMITTED",
        entityId: proof.id,
        title: `${proof.owner.name} submitted proof for “${proof.commitment.title}”`,
        body: note || "Needs your review.",
        data: { url: `/squad?focus=${proof.id}`, proofId: proof.id },
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
    kind: approved ? "PROOF_APPROVED" : "PROOF_CHALLENGED",
    entityId: review.proof.id,
    title: approved
      ? `${review.reviewer.name} approved your proof for “${review.proof.commitment.title}”`
      : `${review.reviewer.name} challenged your proof for “${review.proof.commitment.title}”`,
    body: note || (approved ? "Verified. Nice." : "Needs a better receipt."),
    data: {
      url: `/squad?focus=${review.proof.id}`,
      reviewId: review.id,
      decision: review.decision,
    },
  });
}

export async function notifyTaskMissed(input: {
  taskId: string;
  userId: string;
  circleId: string;
  title: string;
}) {
  return createNotificationAndPush({
    recipientId: input.userId,
    actorId: input.userId,
    circleId: input.circleId,
    kind: "TASK_MISSED",
    entityId: input.taskId,
    title: `You missed “${input.title}” with no proof`,
    body: "You can still upload late proof from Today. The original deadline stays on the record.",
    data: { url: `/squad?focus=${input.taskId}`, taskId: input.taskId },
    allowSelf: true,
  });
}

export async function notifySquadUpdate(input: {
  actorId: string;
  circleId: string;
  entityId: string;
  kind: "TASK_CREATED" | "TASK_RENEGOTIATED" | "CHECK_IN_SET";
  description: string;
}) {
  const prisma = getPrisma();
  const [actor, members] = await Promise.all([
    prisma.user.findUnique({
      where: { id: input.actorId },
      select: { name: true },
    }),
    prisma.membership.findMany({
      where: { circleId: input.circleId, userId: { not: input.actorId } },
      select: { userId: true },
    }),
  ]);
  if (!actor) return;
  await Promise.all(
    members.map((member) =>
      createNotificationAndPush({
        ...input,
        recipientId: member.userId,
        title:
          input.kind === "CHECK_IN_SET"
            ? `${actor.name} checked in`
            : `${actor.name} ${input.kind === "TASK_CREATED" ? "added" : "edited"} a task`,
        body: input.description,
        data: { url: squadHref(input.circleId, input.entityId) },
      }),
    ),
  );
}
