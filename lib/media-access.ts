import "server-only";
import { getPrisma } from "@/lib/prisma";
import { getRequestMembership } from "@/lib/request";

// Shared by files, playback tickets and HLS playlists. Never authorize by ID alone.
export async function authorizedMedia(headers: Headers, id: string) {
  const auth = await getRequestMembership(headers);
  if (!auth) return null;
  const circleId = auth.membership.circleId;
  const prisma = getPrisma();
  const media = await prisma.mediaUpload.findFirst({
    where: { id, circleId, ready: true },
  });
  if (!media) return null;
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
