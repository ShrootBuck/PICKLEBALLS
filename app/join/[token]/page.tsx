import { ArrowRight, Link2Off } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthScreen } from "@/components/auth/auth-screen";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { hashInviteToken } from "@/lib/invites";
import { getPrisma } from "@/lib/prisma";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/");

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
          select: { email: true, label: true },
        })
      : null;

  return (
    <AuthScreen>
      {invite ? (
        <AuthForm
          mode="sign-up"
          inviteToken={token}
          invitedEmail={invite.email}
          inviteLabel={invite.label}
        />
      ) : (
        <Card className="w-full max-w-[460px]">
          <CardHeader>
            <Link2Off aria-hidden="true" />
            <CardTitle>This invite is dead.</CardTitle>
            <CardDescription>
              It expired, got revoked, or somebody already used it. Ask Zayd for
              a fresh one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            One link creates one account. That is the whole damn point.
          </CardContent>
          <CardFooter>
            <Button
              render={<Link href="/sign-in" />}
              nativeButton={false}
              className="w-full"
            >
              Back to sign in
              <ArrowRight data-icon="inline-end" />
            </Button>
          </CardFooter>
        </Card>
      )}
    </AuthScreen>
  );
}
