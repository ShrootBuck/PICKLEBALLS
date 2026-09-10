import "server-only";
import { DomainError } from "@/lib/errors";
import { mediaIdsSchema } from "@/lib/media-policy";
import { getPrisma } from "@/lib/prisma";
import { canEditTask } from "@/lib/task-policy";
import { validateProofTimes } from "@/lib/tasks";
import { phoenixDateKey } from "@/lib/time";
import { serializable } from "@/lib/transaction";

export async function queueProof(
  taskId: string,
  ownerId: string,
  circleId: string,
  mediaIds: string[],
  note: string | null,
  startedAt: Date,
  completedAt: Date,
  now = new Date(),
) {
  validateProofTimes(note, startedAt, completedAt, now);
  if (!mediaIds.length || !mediaIdsSchema.safeParse(mediaIds).success)
    throw new DomainError("Attach a photo or video.");
  return serializable(async (tx) => {
    const existing = await tx.pendingProof.findFirst({
      where: { ownerId, circleId, commitmentId: taskId, dismissed: false },
      orderBy: { createdAt: "desc" },
    });
    // Retry a lost response without creating another post or reserving the same media twice.
    if (existing && existing.mediaIds.join() === mediaIds.join())
      return existing;
    if (existing && !existing.proofId)
      throw new DomainError("This task already has proof processing.", 409);
    const task = await tx.commitment.findFirst({
      where: { id: taskId, userId: ownerId, circleId },
      include: { proofs: { where: { replacedById: null }, take: 1 } },
    });
    if (!task) throw new DomainError("Task not found.", 404);
    if (
      !canEditTask(task.dueAt, now) ||
      task.day.toISOString().slice(0, 10) !== phoenixDateKey(now)
    )
      throw new DomainError(
        "This day is closed. Missed tasks cannot receive new or replacement proof.",
        409,
      );
    if (task.proofs[0] && task.proofs[0].reviewStatus !== "CHALLENGED")
      throw new DomainError(
        "This task already has proof waiting on a verdict.",
        409,
      );
    const pending = await tx.pendingProof.create({
      data: {
        ownerId,
        circleId,
        commitmentId: taskId,
        mediaIds,
        note,
        startedAt,
        completedAt,
        createdAt: now,
      },
    });
    const reserved = await tx.mediaUpload.updateMany({
      where: {
        id: { in: mediaIds },
        ownerId,
        circleId,
        claimed: false,
        pendingProofId: null,
        OR: [{ ready: true }, { uploadedAt: { not: null } }],
      },
      data: { pendingProofId: pending.id },
    });
    if (reserved.count !== mediaIds.length)
      throw new DomainError(
        "Attachments are unavailable or already posted. Choose them again.",
        409,
      );
    return pending;
  });
}

export async function pendingProofStatus(ownerId: string, circleId: string) {
  const pending = await getPrisma().pendingProof.findMany({
    where: { ownerId, circleId, dismissed: false },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const media = await getPrisma().mediaUpload.findMany({
    where: {
      id: { in: pending.flatMap((p) => p.mediaIds) },
      ownerId,
      circleId,
    },
    select: { id: true, ready: true, progress: true, processingError: true },
  });
  return pending.map((p) => {
    const files = p.mediaIds.map((id) => media.find((m) => m.id === id));
    return {
      id: p.id,
      proofId: p.proofId,
      error: p.error,
      progress: Math.floor(
        files.reduce(
          (sum, m) => sum + (m?.ready ? 100 : (m?.progress ?? 0)),
          0,
        ) / files.length,
      ),
    };
  });
}
