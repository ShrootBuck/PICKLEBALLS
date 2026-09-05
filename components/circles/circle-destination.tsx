"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { squadHref } from "@/lib/navigation";

// Push links can be opened while another circle is active. Switch only after
// the page has verified membership, then load the destination with fresh state.
export function CircleDestination({
  circleId,
  focusId,
}: {
  circleId: string;
  focusId?: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt explicitly retries a failed request
  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    fetch("/api/circles/active", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ circleId }),
    })
      .then((response) => {
        if (!response.ok) throw new Error("Could not switch circle.");
        if (!cancelled) window.location.replace(squadHref(circleId, focusId));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [circleId, focusId, attempt]);
  return failed ? (
    <Alert variant="destructive">
      <AlertTitle>Could not open that circle</AlertTitle>
      <AlertDescription>
        Check your connection and try again.
        <Button
          variant="outline"
          onClick={() => setAttempt((value) => value + 1)}
        >
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  ) : (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Spinner /> Opening the right circle…
    </p>
  );
}
