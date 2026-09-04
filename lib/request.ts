import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { ensureBootstrapMembership } from "@/lib/bootstrap";
import { ACTIVE_CIRCLE_COOKIE, parseActiveCircleId } from "@/lib/circles";
import { getPrisma } from "@/lib/prisma";

export function hasSameOrigin(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin) return origin === requestOrigin;
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin === requestOrigin;
    } catch {
      return false;
    }
  }
  // Mutations must prove their origin. Plain cross-site form POSTs often
  // omit Origin, and a Host check would pass those by definition — so a
  // missing Origin/Referer is a rejection, not a pass.
  return false;
}

async function getMembership(
  userId: string,
  preferredCircleId?: string | null,
) {
  const prisma = getPrisma();
  if (preferredCircleId) {
    const preferred = await prisma.membership.findUnique({
      where: { userId_circleId: { userId, circleId: preferredCircleId } },
      include: { circle: true, user: true },
    });
    if (preferred) return preferred;
  }
  const membership = await prisma.membership.findFirst({
    where: { userId },
    include: { circle: true, user: true },
    orderBy: { createdAt: "asc" },
  });
  return membership ?? ensureBootstrapMembership(userId);
}

export async function getRequestMembership(requestHeaders: Headers) {
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return null;
  const preferred = parseActiveCircleId(requestHeaders.get("cookie"));
  const membership = await getMembership(session.user.id, preferred);
  return membership ? { session, membership } : null;
}

export const requireSession = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  return { session };
});

export const requirePageMembership = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  const cookieStore = await cookies();
  const preferred = cookieStore.get(ACTIVE_CIRCLE_COOKIE)?.value ?? null;
  const membership = await getMembership(session.user.id, preferred);
  // Authenticated but circless: send to onboarding instead of bouncing
  // back to sign-in (which would just redirect forward again).
  if (!membership) redirect("/circles");
  return { session, membership };
});
