"use client";

import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
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
      <Button onClick={retry} variant="outline" className="self-start">
        Try again
      </Button>
    </div>
  );
}
