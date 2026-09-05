import { Link2Off } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { AuthScreen } from "@/components/auth/auth-screen";
import { DiscordButton } from "@/components/auth/discord-button";
import { JoinCircleButton } from "@/components/join/join-circle-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { hashInviteToken } from "@/lib/invites";
import { getPrisma } from "@/lib/prisma";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const headerStore = await headers();
  const session = await auth.api.getSession({ headers: headerStore });
  const { token } = await params;
  const now = new Date();
  const invite =
    token.length >= 32 && token.length <= 200
      ? await getPrisma().invite.findFirst({
          where: {
            tokenHash: hashInviteToken(token),
            expiresAt: { gt: now },
            revokedAt: null,
            usedAt: null,
            OR: [{ claimExpiresAt: null }, { claimExpiresAt: { lt: now } }],
          },
          select: {
            circleId: true,
            label: true,
            circle: {
              select: {
                name: true,
                _count: { select: { memberships: true } },
              },
            },
          },
        })
      : null;
  if (!invite) {
    return (
      <AuthScreen>
        <div className="flex flex-col gap-4">
          <Alert variant="destructive">
            <Link2Off />
            <AlertTitle>This invite is dead.</AlertTitle>
            <AlertDescription>
              Expired, revoked, already used, or currently reserved.
            </AlertDescription>
          </Alert>
          <Button
            render={<Link href={session ? "/circles" : "/sign-in"} />}
            nativeButton={false}
            variant="outline"
          >
            {session ? "Back to circles" : "Back to sign in"}
          </Button>
        </div>
      </AuthScreen>
    );
  }
  const memberCount = invite.circle._count.memberships;
  // Logged-in users (e.g. joining a second circle) claim directly —
  // no need to go through Discord again.
  if (session) {
    const already = await getPrisma().membership.findFirst({
      where: {
        userId: session.user.id,
        circleId: invite.circleId,
      },
      select: { circleId: true },
    });
    return (
      <AuthScreen>
        <div className="flex flex-col gap-4">
          <Badge variant="secondary" className="w-fit">
            One-time invite{invite.label ? ` · ${invite.label}` : ""}
          </Badge>
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold">
              Join “{invite.circle.name}”?
            </h2>
            <p className="text-sm text-muted-foreground">
              {memberCount} {memberCount === 1 ? "person" : "people"} in this
              circle. You join as {session.user.name}.
              {already
                ? " Looks like you are already in — continuing just switches you over."
                : ""}
            </p>
          </div>
          <JoinCircleButton token={token} />
        </div>
      </AuthScreen>
    );
  }
  return (
    <AuthScreen>
      <div className="flex flex-col gap-4">
        <Badge variant="secondary" className="w-fit">
          One-time invite{invite.label ? ` · ${invite.label}` : ""}
        </Badge>
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">
            Join “{invite.circle.name}”.
          </h2>
          <p className="text-sm text-muted-foreground">
            {memberCount} {memberCount === 1 ? "person" : "people"} in this
            circle. Discord supplies your name and profile photo. The invite is
            reserved when you continue.
          </p>
        </div>
        <DiscordButton inviteToken={token} />
      </div>
    </AuthScreen>
  );
}
