import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { ensureBootstrapMembership } from "@/lib/bootstrap";
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
  // Same-origin fetch may omit origin/referer in some environments; fall back to host check.
  const host = request.headers.get("host");
  if (host) {
    try {
      return new URL(request.url).host === host;
    } catch {
      return false;
    }
  }
  return false;
}

async function getMembership(userId: string) {
  const membership = await getPrisma().membership.findFirst({
    where: { userId },
    include: { circle: true, user: true },
    orderBy: { createdAt: "asc" },
  });
  return membership ?? ensureBootstrapMembership(userId);
}

export async function getRequestMembership(requestHeaders: Headers) {
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return null;
  const membership = await getMembership(session.user.id);
  return membership ? { session, membership } : null;
}

export const requirePageMembership = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  const membership = await getMembership(session.user.id);
  if (!membership) redirect("/sign-in?error=membership");
  return { session, membership };
});
