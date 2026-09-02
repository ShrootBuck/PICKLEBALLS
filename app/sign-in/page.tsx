import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthScreen } from "@/components/auth/auth-screen";
import { DiscordButton } from "@/components/auth/discord-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { auth } from "@/lib/auth";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; invite?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/");
  const query = await searchParams;
  return (
    <AuthScreen>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">Get back to work.</h2>
          <p className="text-sm text-muted-foreground">
            Returning friends sign in here. New friends need a one-time invite.
          </p>
        </div>
        {query.invite === "required" && (
          <Alert>
            <AlertTitle>New here?</AlertTitle>
            <AlertDescription>
              Sign-up is invite-only. Use the one-time link from the owner, or
              sign in below if you already joined.
            </AlertDescription>
          </Alert>
        )}
        {query.error && (
          <Alert variant="destructive">
            <AlertTitle>Access denied.</AlertTitle>
            <AlertDescription>
              Your Discord account is not in this squad. Use your invite link or
              ask Zayd.
            </AlertDescription>
          </Alert>
        )}
        <DiscordButton />
      </div>
    </AuthScreen>
  );
}
