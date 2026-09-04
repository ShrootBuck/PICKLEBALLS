"use client";

import { Clock3 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
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

export function MidnightCountdown({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [remaining, setRemaining] = useState<number | null>(null);
  const rolledDay = useRef<string | null>(null);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const key = phoenixDateKey(now);
      const ms = getDueMs(now);
      setRemaining(ms);
      if (ms <= 0 && rolledDay.current !== key) {
        // At midnight Phoenix time the board rolls. Soft-refresh so drafts
        // and scroll survive instead of a hard reload.
        rolledDay.current = key;
        router.refresh();
        toast.add({ title: "New day — board rolled.", type: "success" });
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [router]);

  const label =
    remaining === null
      ? "--:--:--"
      : remaining <= 0
        ? "00:00:00"
        : formatRemaining(remaining);
  const suffix = compact ? "" : " until midnight";

  if (remaining === null) {
    return (
      <Badge variant="outline" className="gap-1.5 tabular-nums">
        <Clock3 />
        {label}
        {suffix}
      </Badge>
    );
  }

  const isUrgent = remaining > 0 && remaining < 60 * 60 * 1000;
  const isCritical = remaining > 0 && remaining < 10 * 60 * 1000;

  return (
    <Badge
      variant={isCritical ? "destructive" : isUrgent ? "default" : "secondary"}
      className="gap-1.5 tabular-nums"
      // role="timer" has implicit aria-live="off": screen readers can read
      // the countdown on demand instead of announcing every second.
      role="timer"
    >
      <Clock3 />
      {label}
      {suffix}
    </Badge>
  );
}
