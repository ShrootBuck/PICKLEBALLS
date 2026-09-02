"use client";

import { Clock3 } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { phoenixDateKey, phoenixDayDueAt } from "@/lib/time";

function formatRemaining(ms: number) {
  if (ms <= 0) return "00:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getDueMs(now: Date) {
  const key = phoenixDateKey(now);
  const due = phoenixDayDueAt(key);
  if (!due) return 0;
  return due.getTime() - now.getTime();
}

export function MidnightCountdown() {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const ms = getDueMs(now);
      setRemaining(ms);
      if (ms <= 0) {
        // At midnight Phoenix time the board rolls — refresh once.
        window.location.reload();
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  if (remaining === null) {
    return (
      <Badge variant="outline" className="gap-1.5 tabular-nums">
        <Clock3 />
        --:--:-- until midnight
      </Badge>
    );
  }

  const isUrgent = remaining > 0 && remaining < 60 * 60 * 1000;
  const isCritical = remaining > 0 && remaining < 10 * 60 * 1000;

  return (
    <Badge
      variant={isCritical ? "destructive" : isUrgent ? "default" : "secondary"}
      className="gap-1.5 tabular-nums"
      aria-live="polite"
    >
      <Clock3 />
      {remaining <= 0
        ? "00:00:00 until midnight"
        : `${formatRemaining(remaining)} until midnight`}
    </Badge>
  );
}
