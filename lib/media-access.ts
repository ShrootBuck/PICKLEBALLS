import "server-only";
import { auth as sessionAuth } from "@/lib/auth";
import { directParticipant } from "@/lib/direct-messages";
import { getPrisma } from "@/lib/prisma";
import { getRequestMembership } from "@/lib/request";

// Shared by files and playback tickets. Never authorize by ID alone.
export async function authorizedMedia(headers: Headers, id: string) {
  const prisma = getPrisma();
  const media = await prisma.mediaUpload.findUnique({ where: { id } });
  if (!media?.ready) return null;
  if (media.directConversationId) {
    const session = await sessionAuth.api.getSession({ headers });
    if (!session || !media.claimed) return null;
    const message = await prisma.directMessage.findFirst({
      where: {
        conversationId: media.directConversationId,
        mediaIds: { has: id },
        deletedAt: null,
        conversation: directParticipant(session.user.id),
      },
      select: { id: true },
    });
    return message ? media : null;
  }
  const auth = await getRequestMembership(headers);
  if (!auth || auth.membership.circleId !== media.circleId) return null;
  const circleId = auth.membership.circleId;
  const [proof, reply, screenTime, checkIn] = await Promise.all([
    prisma.taskProof.findFirst({
      where: { circleId, mediaIds: { has: id } },
      select: { id: true },
    }),
    prisma.socialReply.findFirst({
      where: { circleId, mediaIds: { has: id } },
      select: { id: true },
    }),
    prisma.screenTimeReading.findFirst({
      where: {
        mediaId: id,
        circleId,
        OR: [{ userId: auth.session.user.id }, { submission: { isNot: null } }],
      },
      select: { id: true },
    }),
    prisma.checkInUpdate.findFirst({
      where: { circleId, mediaIds: { has: id } },
      select: { id: true },
    }),
  ]);
  return proof || reply || screenTime || checkIn ? media : null;
}

// A DM upload stays attached to its conversation when the active circle changes.
export function ownedMediaScope(userId: string, circleId: string) {
  return {
    ownerId: userId,
    OR: [
      { circleId, directConversationId: null },
      { directConversation: directParticipant(userId) },
    ],
  };
}
