"use client";

import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 py-8">
      <Alert variant="destructive">
        <TriangleAlert />
        <AlertTitle>Something broke.</AlertTitle>
        <AlertDescription>
          {error.message || "The server dropped the ball. Try again."}
        </AlertDescription>
      </Alert>
      <Button onClick={reset} variant="outline" className="self-start">
        Try again
      </Button>
    </div>
  );
}
