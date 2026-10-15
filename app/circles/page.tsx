import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CirclesAccount } from "@/components/circles/circles-account";
import { CirclesManager } from "@/components/circles/circles-manager";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
    include: {
      circle: {
        include: {
          memberships: {
            orderBy: { createdAt: "asc" },
            select: {
              role: true,
              user: { select: { id: true, name: true, image: true } },
            },
          },
        },
      },
    },
  });
  const chat = await prisma.timeblockChat.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  const activeId = parseActiveCircleId(headerStore.get("cookie"));
  const activeIsMember = memberships.some((m) => m.circleId === activeId);
  const params = await searchParams;
  return (
    <main className="circles-page">
      <header className="circles-topbar">
        <Link
          href={memberships.length ? "/" : "/circles"}
          className="social-wordmark"
        >
          <span className="brand-symbol">p.</span>
          <span className="hidden sm:inline">Pickle Balls</span>
        </Link>
        <div className="flex items-center gap-1 sm:gap-3">
          {memberships.length > 0 && (
            <Button
              variant="ghost"
              nativeButton={false}
              render={<Link href="/" />}
            >
              <ArrowLeft data-icon="inline-start" />
              Back to app
            </Button>
          )}
          <CirclesAccount userId={session.user.id} chatId={chat?.id} />
        </div>
      </header>
      {params.invite === "expired" ? (
        <Alert variant="destructive" className="circles-invite-alert">
          <AlertTitle>Your invite expired during sign-in</AlertTitle>
          <AlertDescription>
            You are signed in. Ask your friend for a fresh invite link to join
            their circle.
          </AlertDescription>
        </Alert>
      ) : null}
      <CirclesManager
        initial={memberships.map((membership) => ({
          id: membership.circle.id,
          slug: membership.circle.slug,
          name: membership.circle.name,
          role: membership.role,
          members: membership.circle.memberships.map((member) => ({
            ...member.user,
            role: member.role,
          })),
        }))}
        viewer={{
          id: session.user.id,
          name: session.user.name,
          image: session.user.image ?? null,
        }}
        activeId={
          activeIsMember ? activeId : (memberships[0]?.circleId ?? null)
        }
      />
    </main>
  );
}
