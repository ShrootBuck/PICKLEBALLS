import { z } from "zod";
import { jsonError, readJson } from "@/lib/api";
import {
  directMessageUser,
  privateMessageResponse,
} from "@/lib/direct-message-request";
import { requireDirectConversation } from "@/lib/direct-messages";
import { DomainError } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";
import { limitAction } from "@/lib/rate-limit";
import { publishRealtime } from "@/lib/realtime-server";
import { typingLifetimeMs } from "@/lib/realtime-types";

const inputSchema = z.object({
  active: z.boolean(),
  clientId: z.string().uuid(),
});
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await directMessageUser(request);
    const input = inputSchema.safeParse(await readJson(request));
    if (!input.success) throw new DomainError("Invalid typing update.");
    await limitAction(userId, "dm-typing", 120, 60_000);
    const conversation = await requireDirectConversation(
      getPrisma(),
      (await context.params).id,
      userId,
    );
    await publishRealtime({
      scope: "user",
      id:
        conversation.userAId === userId
          ? conversation.userBId
          : conversation.userAId,
      event: {
        type: "typing",
        conversationId: conversation.id,
        userId,
        ...input.data,
        expiresAt: Date.now() + typingLifetimeMs,
      },
    });
    return privateMessageResponse({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
