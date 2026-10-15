import { jsonError, readJson } from "@/lib/api";
import {
  directMessageUser,
  privateMessageResponse,
} from "@/lib/direct-message-request";
import {
  deleteDirectMessage,
  reactToDirectMessage,
} from "@/lib/direct-messages";
import { limitAction } from "@/lib/rate-limit";

type Context = { params: Promise<{ id: string; messageId: string }> };
export async function PUT(request: Request, context: Context) {
  try {
    const userId = await directMessageUser(request);
    await limitAction(userId, "dm-react", 120, 60_000);
    const { id, messageId } = await context.params;
    return privateMessageResponse({
      message: await reactToDirectMessage(
        userId,
        id,
        messageId,
        await readJson(request),
      ),
    });
  } catch (error) {
    return jsonError(error);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    const userId = await directMessageUser(request);
    await limitAction(userId, "dm-delete", 60, 60_000);
    const { id, messageId } = await context.params;
    return privateMessageResponse({
      message: await deleteDirectMessage(userId, id, messageId),
    });
  } catch (error) {
    return jsonError(error);
  }
}
