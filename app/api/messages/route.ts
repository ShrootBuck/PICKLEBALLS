import { z } from "zod";
import { jsonError, readJson } from "@/lib/api";
import {
  directMessageUser,
  privateMessageResponse,
} from "@/lib/direct-message-request";
import {
  directContacts,
  directInbox,
  directUnreadCount,
  startDirectConversation,
} from "@/lib/direct-messages";
import { DomainError } from "@/lib/errors";
import { limitAction } from "@/lib/rate-limit";

export async function GET(request: Request) {
  try {
    const userId = await directMessageUser(request);
    const query = new URL(request.url).searchParams;
    if (query.has("unread"))
      return privateMessageResponse({
        unread: await directUnreadCount(userId),
      });
    if (query.has("contacts"))
      return privateMessageResponse({ contacts: await directContacts(userId) });
    return privateMessageResponse({ conversations: await directInbox(userId) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await directMessageUser(request);
    await limitAction(userId, "dm-start", 30, 60_000);
    const input = z
      .object({ recipientId: z.string().min(1).max(100) })
      .safeParse(await readJson(request));
    if (!input.success) throw new DomainError("Choose someone to message.");
    return privateMessageResponse(
      await startDirectConversation(userId, input.data.recipientId),
    );
  } catch (error) {
    return jsonError(error);
  }
}
