import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { ACTIVE_CIRCLE_COOKIE, parseActiveCircleId } from "@/lib/circles";
import { getPrisma } from "@/lib/prisma";

export { hasSameOrigin } from "@/lib/request-origin";

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
  return membership;
}

export async function getRequestMembership(requestHeaders: Headers) {
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return null;
  const preferred = parseActiveCircleId(requestHeaders.get("cookie"));
  const membership = await getMembership(session.user.id, preferred);
  return membership ? { session, membership } : null;
}

// Deduplicate session reads within one server render, never across requests.
export const getPageSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);

export const requireSession = cache(async () => {
  const session = await getPageSession();
  if (!session) redirect("/sign-in");
  return { session };
});

export const requirePageMembership = cache(async () => {
  const { session } = await requireSession();
  const cookieStore = await cookies();
  const preferred = cookieStore.get(ACTIVE_CIRCLE_COOKIE)?.value ?? null;
  const membership = await getMembership(session.user.id, preferred);
  // Authenticated but circless: send to onboarding instead of bouncing
  // back to sign-in (which would just redirect forward again).
  if (!membership) redirect("/circles");
  return { session, membership };
});
