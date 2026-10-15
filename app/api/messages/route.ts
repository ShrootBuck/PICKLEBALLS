import { jsonError } from "@/lib/api";
import { privateMessageResponse } from "@/lib/direct-message-request";
import { directInbox, directUnreadCount } from "@/lib/direct-messages";
import { DomainError } from "@/lib/errors";
import { getRequestMembership } from "@/lib/request";

export async function GET(request: Request) {
  try {
    const auth = await getRequestMembership(request.headers);
    if (!auth) throw new DomainError("Sign in to a circle first.", 401);
    const userId = auth.session.user.id;
    const circleId = auth.membership.circleId;
    if (new URL(request.url).searchParams.has("unread"))
      return privateMessageResponse({
        unread: await directUnreadCount(userId, circleId),
      });
    return privateMessageResponse({
      conversations: await directInbox(
        userId,
        circleId,
        new URL(request.url).searchParams.get("chat") ?? undefined,
      ),
    });
  } catch (error) {
    return jsonError(error);
  }
}
