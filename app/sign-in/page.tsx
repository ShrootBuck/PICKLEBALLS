import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthScreen } from "@/components/auth/auth-screen";
import { auth } from "@/lib/auth";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{
    invite?: string | string[];
  }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/");

  const query = await searchParams;

  return (
    <AuthScreen>
      <AuthForm
        mode="sign-in"
        initialError={
          query.invite === "required"
            ? "Signup only works through a one-time invite. Ask Zayd for one."
            : undefined
        }
      />
    </AuthScreen>
  );
}
