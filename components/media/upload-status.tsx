"use client";

import { useCallback, useState } from "react";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";

export function useUploadStatus() {
  const [status, setStatus] = useState("");
  const [percent, setPercent] = useState<number | null>(null);
  const update = useCallback((message: string, value?: number) => {
    setStatus(message);
    setPercent(value == null ? null : Math.max(0, Math.min(100, value)));
  }, []);
  return [status, update, percent] as const;
}

export function UploadStatus({
  status,
  percent,
}: {
  status: string;
  percent: number | null;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border bg-muted/30 p-3">
      {percent === null ? (
        <output className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="shrink-0" />
          <span className="min-w-0 break-words">{status || "Saving…"}</span>
        </output>
      ) : (
        <Progress value={percent}>
          <ProgressLabel className="min-w-0 flex-1 break-words">
            {status}
          </ProgressLabel>
          <ProgressValue />
        </Progress>
      )}
    </div>
  );
}
