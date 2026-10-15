import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { deleteMediaRows } from "@/lib/deletion-storage";
import {
  type DirectMessageItem,
  type DirectThread,
  directMessageSchema,
  directReactionSchema,
} from "@/lib/direct-message-types";
import { DomainError } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";
import { serializable } from "@/lib/transaction";

const personSelect = {
  id: true,
  name: true,
  image: true,
  initials: true,
} as const;
const messageSelect = {
  id: true,
  senderId: true,
  sequence: true,
  revision: true,
  body: true,
  mediaIds: true,
  createdAt: true,
  deletedAt: true,
  reactions: {
    select: { userId: true, emoji: true },
    orderBy: { userId: "asc" },
  },
} satisfies Prisma.DirectMessageSelect;
type MessageRow = Prisma.DirectMessageGetPayload<{
  select: typeof messageSelect;
}>;
const toMessage = (row: MessageRow): DirectMessageItem => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
  deletedAt: row.deletedAt?.toISOString() ?? null,
});
export const directParticipant = (userId: string) => ({
  OR: [{ userAId: userId }, { userBId: userId }],
});

export async function requireDirectConversation(
  tx: Prisma.TransactionClient,
  id: string,
  userId: string,
) {
  const conversation = await tx.directConversation.findFirst({
    where: { id, ...directParticipant(userId) },
    include: {
      userA: { select: personSelect },
      userB: { select: personSelect },
    },
  });
  if (!conversation) throw new DomainError("Conversation not found.", 404);
  return conversation;
}

export async function directContacts(userId: string) {
  return getPrisma().user.findMany({
    where: {
      id: { not: userId },
      memberships: { some: { circle: { memberships: { some: { userId } } } } },
    },
    select: personSelect,
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
}

export async function startDirectConversation(
  userId: string,
  recipientId: string,
) {
  if (userId === recipientId)
    throw new DomainError("Choose someone else to message.");
  const [userAId, userBId] = [userId, recipientId].sort();
  return getPrisma().$transaction(async (tx) => {
    const existing = await tx.directConversation.findUnique({
      where: { userAId_userBId: { userAId, userBId } },
    });
    if (existing) return { id: existing.id };
    const shared = await tx.membership.findFirst({
      where: {
        userId: recipientId,
        circle: { memberships: { some: { userId } } },
      },
      select: { circleId: true },
    });
    if (!shared)
      throw new DomainError(
        "You can start a chat with someone in your circles.",
        403,
      );
    // ON CONFLICT handles simultaneous starts from either side without creating duplicates.
    await tx.directConversation.createMany({
      data: [{ userAId, userBId }],
      skipDuplicates: true,
    });
    return tx.directConversation.findUniqueOrThrow({
      where: { userAId_userBId: { userAId, userBId } },
      select: { id: true },
    });
  });
}

export async function directUnreadCount(userId: string) {
  return getPrisma().directMessage.count({
    where: { recipientId: userId, readAt: null, deletedAt: null },
  });
}

export async function directInbox(userId: string) {
  const rows = await getPrisma().directConversation.findMany({
    where: { ...directParticipant(userId), messages: { some: {} } },
    include: {
      userA: { select: personSelect },
      userB: { select: personSelect },
      messages: {
        take: 1,
        orderBy: { sequence: "desc" },
        select: messageSelect,
      },
      _count: {
        select: {
          messages: {
            where: { recipientId: userId, readAt: null, deletedAt: null },
          },
        },
      },
    },
    orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    person: row.userAId === userId ? row.userB : row.userA,
    lastMessage: row.messages[0] ? toMessage(row.messages[0]) : null,
    unread: row._count.messages,
  }));
}

export async function directThread(
  userId: string,
  id: string,
  query: { before?: number; sinceRevision?: number } = {},
): Promise<DirectThread> {
  return getPrisma().$transaction(
    async (tx) => {
      const conversation = await requireDirectConversation(tx, id, userId);
      const changes = query.sinceRevision !== undefined;
      const rows = await tx.directMessage.findMany({
        where: {
          conversationId: id,
          ...(changes
            ? { revision: { gt: query.sinceRevision } }
            : query.before
              ? { sequence: { lt: query.before } }
              : {}),
        },
        select: messageSelect,
        orderBy: changes ? { revision: "asc" } : { sequence: "desc" },
        take: changes ? 101 : 51,
      });
      const page = rows.slice(0, changes ? 100 : 50);
      const moreChanges = changes && rows.length > 100;
      return {
        id,
        person:
          conversation.userAId === userId
            ? conversation.userB
            : conversation.userA,
        // One message changes per revision, so a bounded changes page cannot skip rows.
        revision: moreChanges
          ? page[page.length - 1].revision
          : conversation.revision,
        messages: page.map(toMessage).sort((a, b) => a.sequence - b.sequence),
        hasMore: !changes && rows.length > 50,
        moreChanges,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}

export async function sendDirectMessage(
  userId: string,
  id: string,
  input: unknown,
) {
  const parsed = directMessageSchema.safeParse(input);
  if (!parsed.success)
    throw new DomainError(
      "Write up to 4,000 characters or attach up to six photos or videos.",
    );
  const { body, clientId, mediaIds } = parsed.data;
  return serializable(async (tx) => {
    const conversation = await requireDirectConversation(tx, id, userId);
    const existing = await tx.directMessage.findUnique({
      where: {
        conversationId_senderId_clientId: {
          conversationId: id,
          senderId: userId,
          clientId,
        },
      },
      select: messageSelect,
    });
    if (existing) return toMessage(existing);
    if (mediaIds.length) {
      const claimed = await tx.mediaUpload.updateMany({
        where: {
          id: { in: mediaIds },
          ownerId: userId,
          directConversationId: id,
          circleId: null,
          ready: true,
          claimed: false,
          pendingProofId: null,
        },
        data: { claimed: true },
      });
      if (claimed.count !== mediaIds.length)
        throw new DomainError(
          "Attachments are unavailable or still processing. Try again when they are ready.",
          409,
        );
    }
    const next = await tx.directConversation.update({
      where: { id },
      data: {
        sequence: { increment: 1 },
        revision: { increment: 1 },
        lastMessageAt: new Date(),
      },
    });
    const row = await tx.directMessage.create({
      data: {
        conversationId: id,
        senderId: userId,
        recipientId:
          conversation.userAId === userId
            ? conversation.userBId
            : conversation.userAId,
        clientId,
        body,
        mediaIds,
        sequence: next.sequence,
        revision: next.revision,
      },
      select: messageSelect,
    });
    return toMessage(row);
  });
}

export async function readDirectMessages(
  userId: string,
  id: string,
  through: number,
) {
  return getPrisma().$transaction(async (tx) => {
    await requireDirectConversation(tx, id, userId);
    // Only acknowledge messages the client has fetched, never a concurrent arrival.
    await tx.directMessage.updateMany({
      where: {
        conversationId: id,
        recipientId: userId,
        sequence: { lte: through },
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    return { read: true };
  });
}

export async function reactToDirectMessage(
  userId: string,
  id: string,
  messageId: string,
  input: unknown,
) {
  const parsed = directReactionSchema.safeParse(input);
  if (!parsed.success) throw new DomainError("Choose a reaction.");
  return serializable(async (tx) => {
    await requireDirectConversation(tx, id, userId);
    const message = await tx.directMessage.findFirst({
      where: { id: messageId, conversationId: id, deletedAt: null },
    });
    if (!message) throw new DomainError("Message not found.", 404);
    if (parsed.data.emoji) {
      await tx.directReaction.upsert({
        where: { messageId_userId: { messageId, userId } },
        create: { messageId, userId, emoji: parsed.data.emoji },
        update: { emoji: parsed.data.emoji },
      });
    } else await tx.directReaction.deleteMany({ where: { messageId, userId } });
    const next = await tx.directConversation.update({
      where: { id },
      data: { revision: { increment: 1 } },
    });
    return toMessage(
      await tx.directMessage.update({
        where: { id: messageId },
        data: { revision: next.revision },
        select: messageSelect,
      }),
    );
  });
}

export async function deleteDirectMessage(
  userId: string,
  id: string,
  messageId: string,
) {
  return serializable(async (tx) => {
    await requireDirectConversation(tx, id, userId);
    const message = await tx.directMessage.findFirst({
      where: { id: messageId, conversationId: id, senderId: userId },
    });
    if (!message) throw new DomainError("Message not found.", 404);
    if (!message.deletedAt) {
      await deleteMediaRows(tx, {
        id: { in: message.mediaIds },
        directConversationId: id,
      });
      await tx.directReaction.deleteMany({ where: { messageId } });
      const next = await tx.directConversation.update({
        where: { id },
        data: { revision: { increment: 1 } },
      });
      await tx.directMessage.update({
        where: { id: messageId },
        data: {
          body: "",
          mediaIds: [],
          deletedAt: new Date(),
          revision: next.revision,
        },
      });
    }
    return toMessage(
      await tx.directMessage.findUniqueOrThrow({
        where: { id: messageId },
        select: messageSelect,
      }),
    );
  });
}
