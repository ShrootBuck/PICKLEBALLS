"use client";

import { useCallback, useState } from "react";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";

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
  // Preparation, retries, and finalization may not have a percentage. Keep
  // the indicator mounted through those stages so the upload UI stays stable.
  if (!status) return null;

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border bg-muted/30 p-3">
      <Progress value={percent}>
        <ProgressLabel className="min-w-0 flex-1 break-words">
          {status}
        </ProgressLabel>
        {percent !== null && <ProgressValue />}
      </Progress>
    </div>
  );
}
