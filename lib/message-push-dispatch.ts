import "server-only";
import { deliverMessagePush } from "@/lib/message-push";
import { getPrisma } from "@/lib/prisma";
import { enqueueJob, usesLocalWorker } from "@/lib/queue";

// Called after commit. Pending rows remain recoverable if dispatch fails.
export async function dispatchMessagePushes(messageId?: string) {
  const prisma = getPrisma();
  const pending = await prisma.messagePushDelivery.findMany({
    where: { messageId, completedAt: null, nextAttemptAt: { lte: new Date() } },
    select: { id: true, attempts: true },
    orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }],
    take: 100,
  });
  const results = await Promise.allSettled(
    pending.map((item) =>
      usesLocalWorker()
        ? enqueueJob(
            "message-notification",
            { deliveryId: item.id },
            // A new recovery slot can replace a job that died before claiming
            // the delivery. The delivery's database lease prevents double sends.
            `message-push:${item.id}:${item.attempts}:${Math.floor(Date.now() / 60_000)}`,
          )
        : deliverMessagePush(item.id),
    ),
  );
  if (results.some((result) => result.status === "rejected"))
    console.warn("Message push dispatch failed; pending deliveries will retry");
}

export async function recoverMessagePushes() {
  await dispatchMessagePushes();
  await getPrisma().messagePushDelivery.deleteMany({
    where: { completedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60_000) } },
  });
}
