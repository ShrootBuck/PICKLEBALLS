import { headers } from "next/headers";
import Link from "next/link";
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
            New here? Just continue — you can start your own circle after.
            Joining a friend? Open their invite link instead.
          </p>
        </div>
        {query.invite === "required" && (
          <Alert>
            <AlertTitle>New here?</AlertTitle>
            <AlertDescription>
              Accounts are free. Continue with Discord, then start your own
              circle — or open a friend&apos;s invite link to join theirs.
            </AlertDescription>
          </Alert>
        )}
        {query.error && (
          <Alert variant="destructive">
            <AlertTitle>Access denied.</AlertTitle>
            <AlertDescription>
              That Discord sign-in did not work. Try again or use your invite
              link.
            </AlertDescription>
          </Alert>
        )}
        <DiscordButton />
        <p className="text-center text-sm text-muted-foreground">
          Starting fresh?{" "}
          <Link
            href="/sign-up"
            className="font-medium underline-offset-4 hover:underline"
          >
            Sign up and launch your circle
          </Link>
        </p>
      </div>
    </AuthScreen>
  );
}
