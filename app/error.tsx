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
    <html lang="en">
      <body className="flex min-h-svh items-center justify-center p-6">
        <div className="flex w-full max-w-md flex-col gap-4">
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>App crashed.</AlertTitle>
            <AlertDescription>
              {error.message || "Unexpected error. Try again."}
            </AlertDescription>
          </Alert>
          <Button onClick={reset}>Try again</Button>
        </div>
      </body>
    </html>
  );
}
