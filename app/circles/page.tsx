import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthScreen } from "@/components/auth/auth-screen";
import { CirclesManager } from "@/components/circles/circles-manager";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { auth } from "@/lib/auth";
import { parseActiveCircleId } from "@/lib/circle-cookie";
import { getPrisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Circles" };

export default async function CirclesPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const headerStore = await headers();
  const session = await auth.api.getSession({ headers: headerStore });
  if (!session) redirect("/sign-in");
  const prisma = getPrisma();
  const memberships = await prisma.membership.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    include: { circle: true },
  });
  const activeId = parseActiveCircleId(headerStore.get("cookie"));
  const activeIsMember = memberships.some((m) => m.circleId === activeId);
  const params = await searchParams;
  return (
    <AuthScreen>
      {params.invite === "expired" ? (
        <Alert variant="destructive">
          <AlertTitle>Your invite expired during sign-in</AlertTitle>
          <AlertDescription>
            You are signed in. Ask your friend for a fresh invite link to join
            their circle.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">
          {memberships.length === 0 ? "Start your circle." : "Pick a circle."}
        </h2>
        <p className="text-sm text-muted-foreground">
          {memberships.length === 0
            ? "No invites needed to start your own. Name it, then invite your people."
            : "Jump back in, or start a fresh one for a different crew."}
        </p>
      </div>
      <CirclesManager
        initial={memberships.map((membership) => ({
          id: membership.circle.id,
          slug: membership.circle.slug,
          name: membership.circle.name,
          role: membership.role,
        }))}
        activeId={
          activeIsMember ? activeId : (memberships[0]?.circleId ?? null)
        }
      />
    </AuthScreen>
  );
}
