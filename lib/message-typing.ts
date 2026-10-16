import "server-only";

import { requireDirectConversation } from "@/lib/direct-messages";
import { DomainError } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";
import { limitAction } from "@/lib/rate-limit";
import { typingInputSchema } from "@/lib/realtime-protocol";
import { publishRealtime } from "@/lib/realtime-server";
import { typingLifetimeMs } from "@/lib/realtime-types";

export async function publishTyping(
  userId: string,
  conversationId: string,
  value: unknown,
) {
  const input = typingInputSchema.safeParse(value);
  if (!input.success) throw new DomainError("Invalid typing update.");
  await limitAction(userId, "dm-typing", 120, 60_000);
  const conversation = await requireDirectConversation(
    getPrisma(),
    conversationId,
    userId,
  );
  const target =
    conversation.circleId ??
    (conversation.userAId === userId
      ? conversation.userBId
      : conversation.userAId);
  if (!target) throw new DomainError("Conversation not found.", 404);
  await publishRealtime({
    scope: conversation.circleId ? "circle" : "user",
    id: target,
    event: {
      type: "typing",
      conversationId: conversation.id,
      userId,
      ...input.data,
      expiresAt: Date.now() + typingLifetimeMs,
    },
  });
}
