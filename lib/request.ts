import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export function hasSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return origin === new URL(request.url).origin;
}

export async function getRequestMembership(requestHeaders: Headers) {
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return null;
  const membership = await getPrisma().membership.findFirst({
    where: { userId: session.user.id },
    include: { circle: true, user: true },
    orderBy: { createdAt: "asc" },
  });
  return membership ? { session, membership } : null;
}

export async function requirePageMembership() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  const membership = await getPrisma().membership.findFirst({
    where: { userId: session.user.id },
    include: { circle: true, user: true },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) redirect("/sign-in?error=membership");
  return { session, membership };
}
