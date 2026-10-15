import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { deleteMediaRows } from "@/lib/deletion-storage";
import {
  type ConversationDetails,
  type DirectInboxItem,
  type DirectMessageItem,
  type DirectPerson,
  type DirectThread,
  directMessageSchema,
  directReactionSchema,
} from "@/lib/direct-message-types";
import { DomainError } from "@/lib/errors";
import { dispatchMessagePushes } from "@/lib/message-push-dispatch";
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
  clientId: true,
  senderId: true,
  sender: { select: personSelect },
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
  OR: [
    { userAId: userId },
    { userBId: userId },
    { circle: { memberships: { some: { userId } } } },
  ],
});

function conversationDetails(
  row: {
    userAId: string | null;
    userA: DirectPerson | null;
    userB: DirectPerson | null;
    circle: { id: string; name: string } | null;
  },
  userId: string,
): ConversationDetails {
  if (row.circle) return { kind: "group", person: null, group: row.circle };
  const person = row.userAId === userId ? row.userB : row.userA;
  if (!person) throw new DomainError("Conversation not found.", 404);
  return { kind: "direct", person, group: null };
}

async function requireCircleMember(userId: string, circleId: string) {
  const member = await getPrisma().membership.findUnique({
    where: { userId_circleId: { userId, circleId } },
  });
  if (!member) throw new DomainError("Circle not found.", 404);
  return member;
}

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
      circle: { select: { id: true, name: true } },
    },
  });
  if (!conversation) throw new DomainError("Conversation not found.", 404);
  return conversation;
}

export async function directContacts(userId: string, circleId: string) {
  await requireCircleMember(userId, circleId);
  return getPrisma().user.findMany({
    where: {
      id: { not: userId },
      memberships: { some: { circleId } },
    },
    select: personSelect,
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
}

export async function directUnreadCount(userId: string, circleId: string) {
  const member = await requireCircleMember(userId, circleId);
  return getPrisma().directMessage.count({
    where: {
      deletedAt: null,
      OR: [
        {
          recipientId: userId,
          readAt: null,
          sender: { memberships: { some: { circleId } } },
        },
        {
          conversation: { circleId },
          senderId: { not: userId },
          sequence: { gt: member.groupReadThrough },
        },
      ],
    },
  });
}

export async function directInbox(
  userId: string,
  circleId: string,
  requestedChat?: string,
): Promise<DirectInboxItem[]> {
  const member = await requireCircleMember(userId, circleId);
  const contacts = await directContacts(userId, circleId);
  // Empty conversations belong in the list too. The unique keys make opening
  // either person's inbox concurrently safe without a separate creation flow.
  await getPrisma().directConversation.createMany({
    data: [
      { circleId },
      ...contacts.map(({ id }) => {
        const [userAId, userBId] = [userId, id].sort();
        return { userAId, userBId };
      }),
    ],
    skipDuplicates: true,
  });
  const contactIds = contacts.map(({ id }) => id);
  const rows = await getPrisma().directConversation.findMany({
    where: {
      OR: [
        { circleId },
        { userAId: userId, userBId: { in: contactIds } },
        { userBId: userId, userAId: { in: contactIds } },
        // A DM alert can arrive while a different circle's directory is open.
        // Include only the explicitly requested private chat the viewer owns.
        ...(requestedChat
          ? [
              {
                id: requestedChat,
                circleId: null,
                OR: [{ userAId: userId }, { userBId: userId }],
              },
            ]
          : []),
      ],
    },
    include: {
      userA: { select: personSelect },
      userB: { select: personSelect },
      circle: { select: { id: true, name: true } },
      messages: {
        take: 1,
        orderBy: { sequence: "desc" },
        select: messageSelect,
      },
      _count: {
        select: {
          messages: {
            where: {
              deletedAt: null,
              OR: [
                { recipientId: userId, readAt: null },
                {
                  conversation: { circleId },
                  senderId: { not: userId },
                  sequence: { gt: member.groupReadThrough },
                },
              ],
            },
          },
        },
      },
    },
  });
  return rows
    .map((row) => ({
      ...conversationDetails(row, userId),
      id: row.id,
      lastMessage: row.messages[0] ? toMessage(row.messages[0]) : null,
      unread: row._count.messages,
    }))
    .sort(
      (a, b) =>
        (b.lastMessage ? Date.parse(b.lastMessage.createdAt) : 0) -
        (a.lastMessage ? Date.parse(a.lastMessage.createdAt) : 0),
    );
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
      const lastRead = await tx.directMessage.findFirst({
        where: { conversationId: id, senderId: userId, readAt: { not: null } },
        orderBy: { sequence: "desc" },
        select: { sequence: true },
      });
      return {
        ...conversationDetails(conversation, userId),
        id,
        readThrough: lastRead?.sequence ?? 0,
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
  const message = await serializable(async (tx) => {
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
    const recipients = conversation.circleId
      ? await tx.membership.findMany({
          where: { circleId: conversation.circleId, userId: { not: userId } },
          select: { userId: true },
        })
      : [
          {
            userId:
              conversation.userAId === userId
                ? conversation.userBId
                : conversation.userAId,
          },
        ];
    await tx.messagePushDelivery.createMany({
      data: recipients.flatMap((recipient) =>
        recipient.userId
          ? [{ messageId: row.id, recipientId: recipient.userId }]
          : [],
      ),
    });
    return toMessage(row);
  });
  await dispatchMessagePushes(message.id).catch(() => {
    console.warn("Message saved; push dispatch will retry");
  });
  return message;
}

export async function readDirectMessages(
  userId: string,
  id: string,
  through: number,
) {
  return getPrisma().$transaction(async (tx) => {
    const conversation = await requireDirectConversation(tx, id, userId);
    if (conversation.circleId) {
      const position = Math.min(through, conversation.sequence);
      await tx.membership.updateMany({
        where: {
          userId,
          circleId: conversation.circleId,
          groupReadThrough: { lt: position },
        },
        data: { groupReadThrough: position },
      });
      return { read: true };
    }
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
