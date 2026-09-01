import { ArrowLeft, ShieldCheck } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { InvitePanel } from "@/components/admin/invite-panel";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/invites";
import { getPrisma } from "@/lib/prisma";

export default async function AdminPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  if (!isAdminEmail(session.user.email)) notFound();

  const prisma = getPrisma();
  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: { circleId: true },
  });
  if (!membership) {
    throw new Error("Admin account has no Pickle Balls membership.");
  }

  const invites = await prisma.invite.findMany({
    where: { circleId: membership.circleId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      label: true,
      email: true,
      createdAt: true,
      expiresAt: true,
      usedAt: true,
      revokedAt: true,
      usedBy: { select: { name: true, email: true } },
    },
  });

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <span className="admin-kicker">
            <ShieldCheck aria-hidden="true" />
            ZAYD ONLY
          </span>
          <h1>Invite control.</h1>
          <p>Create the door, send the door, then watch it permanently lock.</p>
        </div>
        <Button
          variant="outline"
          render={<Link href="/" />}
          nativeButton={false}
        >
          <ArrowLeft data-icon="inline-start" />
          Back to the app
        </Button>
      </header>
      <InvitePanel
        invites={invites.map((invite) => ({
          ...invite,
          createdAt: invite.createdAt.toISOString(),
          expiresAt: invite.expiresAt.toISOString(),
          usedAt: invite.usedAt?.toISOString() ?? null,
          revokedAt: invite.revokedAt?.toISOString() ?? null,
        }))}
      />
    </main>
  );
}
