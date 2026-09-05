"use client";

import { LogIn } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

export function DiscordButton({ inviteToken }: { inviteToken?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <Button
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          try {
            const result = await authClient.signIn.social({
              provider: "discord",
              callbackURL: "/",
              errorCallbackURL: "/sign-in?error=oauth",
              requestSignUp: true,
              ...(inviteToken ? { additionalData: { inviteToken } } : {}),
            });
            if (result.error) {
              setError(result.error.message ?? "Discord sign-in failed.");
              setPending(false);
            }
          } catch {
            setError(
              "Could not reach Discord. Check your connection and try again.",
            );
            setPending(false);
          }
        }}
      >
        {pending ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <LogIn data-icon="inline-start" />
        )}
        {pending
          ? "Opening Discord…"
          : inviteToken
            ? "Join with Discord"
            : "Continue with Discord"}
      </Button>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Discord did not work.</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
