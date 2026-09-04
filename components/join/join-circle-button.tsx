"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function JoinCircleButton({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <Button
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          try {
            const response = await fetch("/api/circles/join", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ token }),
            });
            const body = (await response.json().catch(() => ({}))) as {
              error?: string;
            };
            if (!response.ok) {
              setError(body.error ?? "Could not join that circle.");
              setPending(false);
            } else {
              router.push("/");
              router.refresh();
            }
          } catch {
            setError("Could not reach the server. Check your wifi.");
            setPending(false);
          }
        }}
      >
        {pending ? <Spinner data-icon="inline-start" /> : null}
        {pending ? "Joining…" : "Join this circle"}
      </Button>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not join.</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
