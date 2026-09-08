import "server-only";
import { memberHref, postHref } from "@/lib/navigation";
import { getPrisma } from "@/lib/prisma";

// Old inbox and shared links remain useful after the board moves into profiles.
export async function resolveLegacyFocus(
  circleId: string,
  focusId: string,
): Promise<string | null> {
  const prisma = getPrisma();
  const [proof, task, update, checkIn] = await Promise.all([
    prisma.taskProof.findFirst({
      where: {
        circleId,
        OR: [{ id: focusId }, { reviews: { some: { id: focusId } } }],
      },
      select: { id: true },
    }),
    prisma.commitment.findFirst({
      where: { circleId, id: focusId },
      select: { userId: true, day: true, id: true },
    }),
    prisma.checkInUpdate.findFirst({
      where: { circleId, id: focusId },
      select: { id: true },
    }),
    prisma.checkIn.findFirst({
      where: { circleId, id: focusId },
      select: {
        updates: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true },
        },
      },
    }),
  ]);
  if (proof)
    return `${postHref(circleId, "proof", proof.id)}${proof.id === focusId ? "" : `&focus=${encodeURIComponent(focusId)}#verdicts`}`;
  if (task)
    return `${memberHref(circleId, task.userId, "tasks", task.day.toISOString().slice(0, 10))}&focus=${encodeURIComponent(task.id)}#task-${encodeURIComponent(task.id)}`;
  if (update) return postHref(circleId, "check-in", update.id);
  if (checkIn?.updates[0])
    return `${postHref(circleId, "check-in", checkIn.updates[0].id)}&discussion=legacy#legacy-discussion`;
  return null;
}
