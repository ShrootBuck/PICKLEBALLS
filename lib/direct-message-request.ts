import "server-only";
import { auth } from "@/lib/auth";
import { DomainError } from "@/lib/errors";
import { hasSameOrigin } from "@/lib/request";

export async function directMessageUser(request: Request) {
  if (request.method !== "GET" && !hasSameOrigin(request))
    throw new DomainError("Bad origin.", 403);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) throw new DomainError("Sign in first.", 401);
  return session.user.id;
}

export const privateMessageResponse = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { "cache-control": "private, no-store" },
  });
