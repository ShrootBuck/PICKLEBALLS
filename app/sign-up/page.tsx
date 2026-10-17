import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthScreen } from "@/components/auth/auth-screen";
import { DiscordButton } from "@/components/auth/discord-button";
import { auth } from "@/lib/auth";

export default async function SignUpPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/");
  return (
    <AuthScreen>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">Start your circle.</h2>
          <p className="text-sm text-muted-foreground">
            Sign in with Discord, then create a private group for your
            classmates or friends. Already have an invite? Open that link to
            join their circle.
          </p>
        </div>
        <DiscordButton />
        <p className="text-center text-sm text-muted-foreground">
          Already in a circle?{" "}
          <Link
            href="/sign-in"
            className="font-medium underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </AuthScreen>
  );
}
