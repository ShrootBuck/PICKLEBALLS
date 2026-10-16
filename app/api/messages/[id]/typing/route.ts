import { jsonError, readJson } from "@/lib/api";
import {
  directMessageUser,
  privateMessageResponse,
} from "@/lib/direct-message-request";
import { publishTyping } from "@/lib/message-typing";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await directMessageUser(request);
    await publishTyping(
      userId,
      (await context.params).id,
      await readJson(request),
    );
    return privateMessageResponse({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
