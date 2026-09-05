"use client";

import { Clock3 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { phoenixDateKey, phoenixDayDueAt } from "@/lib/time";

function formatRemaining(ms: number) {
  if (ms <= 0) return "00:00:00";
  const totalSeconds = Math.ceil(ms / 1000);
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
    let id: number;
    const tick = () => {
      window.clearTimeout(id);
      const now = new Date();
      const key = phoenixDateKey(now);
      const ms = getDueMs(now);
      setRemaining(ms);
      if (rolledDay.current !== null && rolledDay.current !== key) {
        // At midnight Phoenix time the board rolls. Soft-refresh so drafts
        // and scroll survive instead of a hard reload.
        router.refresh();
        toast.add({ title: "New day — board rolled.", type: "success" });
      }
      rolledDay.current = key;
      // Re-align every tick so delayed callbacks never accumulate clock drift.
      id = window.setTimeout(tick, 1000 - (Date.now() % 1000));
    };
    tick();
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("visibilitychange", tick);
    };
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
      aria-label={`${label} until midnight in Phoenix`}
      title="Daily deadline · midnight in Phoenix"
    >
      <Clock3 />
      {label}
      {suffix}
    </Badge>
  );
}
