import { refreshDiscordAvatar } from "@/lib/discord-avatar";
import { getPrisma } from "@/lib/prisma";
import { limitAction } from "@/lib/rate-limit";
import { getRequestMembership } from "@/lib/request";
import { readBoundedBody } from "@/lib/request-body";
import { isSuperAdmin } from "@/lib/super-admin";

function failure(status: number) {
  return new Response(null, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export const runtime = "nodejs";
export async function GET(request: Request) {
  const auth = await getRequestMembership(request.headers);
  if (!auth) return failure(404);
  const userId = new URL(request.url).searchParams.get("userId");
  if (!userId || userId.length > 128) return failure(400);
  try {
    // Generous: a feed renders many avatars, and the browser caches each one.
    await limitAction(auth.session.user.id, "avatar", 300, 60_000);
  } catch {
    return failure(429);
  }
  try {
    const viewerId = auth.session.user.id;
    const select = {
      id: true,
      image: true,
      accounts: {
        where: { providerId: "discord" },
        select: { id: true, accountId: true },
        take: 1,
      },
    } as const;
    const prisma = getPrisma();
    let user = await prisma.user.findFirst({
      where: {
        id: userId,
        OR: [
          { id: viewerId },
          {
            memberships: {
              some: { circle: { memberships: { some: { userId: viewerId } } } },
            },
          },
          { directConversationsA: { some: { userBId: viewerId } } },
          { directConversationsB: { some: { userAId: viewerId } } },
        ],
      },
      select,
    });
    if (!user && (await isSuperAdmin(viewerId))) {
      user = await prisma.user.findUnique({ where: { id: userId }, select });
    }
    if (!user) return failure(404);
    const source = await refreshDiscordAvatar(user);
    if (!source) return failure(404);
    const upstream = await fetch(source, {
      redirect: "error",
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    const type = upstream.headers.get("content-type")?.split(";")[0];
    if (
      !upstream.ok ||
      !type ||
      !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(type)
    )
      return failure(404);
    const data = await readBoundedBody(
      new Request(source, {
        method: "POST",
        body: upstream.body,
        duplex: "half",
      } as RequestInit),
      1024 * 1024,
    );
    return new Response(data, {
      headers: {
        "content-type": type,
        "cache-control": "private, max-age=60, must-revalidate",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return failure(502);
  }
}
